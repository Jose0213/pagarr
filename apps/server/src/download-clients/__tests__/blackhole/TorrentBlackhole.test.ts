import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { createDownloadClientDefinition } from "../../DownloadClientDefinition.js";
import { createDownloadClientItem } from "../../DownloadClientItem.js";
import { DownloadItemStatus } from "../../DownloadItemStatus.js";
import { OsPath } from "../../OsPath.js";
import { identityRemotePathMappingService } from "../../RemotePathMappingService.js";
import { ReleaseDownloadException } from "../../TorrentClientBase.js";
import { TorrentBlackhole } from "../../blackhole/TorrentBlackhole.js";
import { createTorrentBlackholeSettings } from "../../blackhole/TorrentBlackholeSettings.js";
import type { IScanWatchFolder } from "../../blackhole/ScanWatchFolder.js";
import { createWatchFolderItem } from "../../blackhole/WatchFolderItem.js";
import {
  fakeConfigService,
  fakeDiskProvider,
  fakeHttpClient,
  createTestRemoteBook,
} from "../testFixtures.js";

function fakeScanWatchFolder(
  items: ReturnType<typeof createWatchFolderItem>[] = []
): IScanWatchFolder {
  return { getItems: vi.fn(async () => items) };
}

// A real bencoded .torrent file with a single-file info dict, so
// getHashFromTorrentFile() can compute a real SHA-1 info-hash from it.
function fakeTorrentFileBytes(): Uint8Array {
  return new TextEncoder().encode("d8:announce3:foo4:infod6:lengthi100e4:name5:filesee");
}

function buildClient(
  scanWatchFolder: IScanWatchFolder = fakeScanWatchFolder(),
  diskProviderOverrides = {}
) {
  const diskProvider = fakeDiskProvider(diskProviderOverrides);
  const client = new TorrentBlackhole(
    scanWatchFolder,
    fakeHttpClient({
      get: vi.fn(
        async (req) => new HttpResponse(req, new HttpHeader(), fakeTorrentFileBytes(), 200)
      ),
    }),
    fakeConfigService(),
    diskProvider,
    identityRemotePathMappingService
  );
  client.definition = createDownloadClientDefinition({
    id: 1,
    name: "TestBlackhole",
    implementation: "TorrentBlackhole",
    settings: createTorrentBlackholeSettings({
      torrentFolder: "C:\\Torrents",
      watchFolder: "C:\\Watch",
    }),
  });
  return { client, diskProvider };
}

describe("TorrentBlackhole", () => {
  it("preferTorrentFile is true", () => {
    const { client } = buildClient();
    expect(client.preferTorrentFile).toBe(true);
  });

  it("writes the .torrent file to the torrent folder on addFromTorrentFile", async () => {
    let writtenPath: string | undefined;
    const writes: Buffer[] = [];
    const stream = {
      write: (chunk: Buffer, cb: (err?: Error) => void) => {
        writes.push(chunk);
        cb();
        return true;
      },
      end: (cb: () => void) => cb(),
    };

    const { client } = buildClient(fakeScanWatchFolder(), {
      openWriteStream: vi.fn((path: string) => {
        writtenPath = path;
        return stream as never;
      }),
    });

    const remoteBook = createTestRemoteBook();
    await client.download(remoteBook, null);

    expect(writtenPath).toBe("C:\\Torrents\\Droned.S01E01.Pilot.1080p.WEB-DL-DRONE.torrent");
  });

  it("rejects a magnet-only release as ReleaseDownloadException when SaveMagnetFiles is off (default)", async () => {
    const { client } = buildClient();
    // saveMagnetFiles defaults to false, so addFromMagnetLink throws
    // MagnetNotSupportedError, which download()'s preferTorrentFile branch
    // re-wraps into ReleaseDownloadException (see TorrentClientBase.ts).
    const remoteBook = createTestRemoteBook({
      release: {
        ...createTestRemoteBook().release,
        downloadUrl: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp",
      },
    });

    await expect(client.download(remoteBook, null)).rejects.toThrow(ReleaseDownloadException);
  });

  it("saves a magnet file when SaveMagnetFiles is enabled", async () => {
    let writtenPath: string | undefined;
    const stream = {
      write: (chunk: Buffer, cb: (err?: Error) => void) => {
        cb();
        return true;
      },
      end: (cb: () => void) => cb(),
    };

    const { client } = buildClient(fakeScanWatchFolder(), {
      openWriteStream: vi.fn((path: string) => {
        writtenPath = path;
        return stream as never;
      }),
    });
    (
      client.definition.settings as ReturnType<typeof createTorrentBlackholeSettings>
    ).saveMagnetFiles = true;

    const remoteBook = createTestRemoteBook({
      release: {
        ...createTestRemoteBook().release,
        downloadUrl: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp",
      },
    });

    await client.download(remoteBook, null);
    expect(writtenPath).toBe("C:\\Torrents\\Droned.S01E01.Pilot.1080p.WEB-DL-DRONE.magnet");
  });

  it("getItems() maps watch-folder items into DownloadClientItems, prefixed by definition name", async () => {
    const watchItem = createWatchFolderItem({
      downloadId: "abc_123",
      title: "MyBook",
      totalSize: 500,
      status: DownloadItemStatus.Completed,
      outputPath: new OsPath("C:\\Watch\\MyBook"),
    });
    const { client } = buildClient(fakeScanWatchFolder([watchItem]));
    // readOnly defaults to true (createTorrentBlackholeSettings) -- flip it
    // off here to exercise the canMoveFiles/canBeRemoved=true path.
    (client.definition.settings as ReturnType<typeof createTorrentBlackholeSettings>).readOnly =
      false;

    const items = await client.getItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.downloadId).toBe("TestBlackhole_abc_123");
    expect(items[0]!.category).toBe("Readarr");
    expect(items[0]!.canMoveFiles).toBe(true);
    expect(items[0]!.canBeRemoved).toBe(true);
  });

  it("getItems() respects readOnly by disabling canMoveFiles/canBeRemoved", async () => {
    const watchItem = createWatchFolderItem({ downloadId: "abc_123", title: "MyBook" });
    const { client } = buildClient(fakeScanWatchFolder([watchItem]));
    (client.definition.settings as ReturnType<typeof createTorrentBlackholeSettings>).readOnly =
      true;

    const [item] = await client.getItems();
    expect(item!.canMoveFiles).toBe(false);
    expect(item!.canBeRemoved).toBe(false);
  });

  it("removeItem() throws when deleteData is false", async () => {
    const { client } = buildClient();
    const item = createDownloadClientItem({
      downloadId: "x",
      outputPath: new OsPath("C:\\Watch\\x"),
    });
    await expect(client.removeItem(item, false)).rejects.toThrow();
  });

  it("removeItem() deletes the folder when deleteData is true", async () => {
    const { client, diskProvider } = buildClient();
    const item = createDownloadClientItem({
      downloadId: "x",
      outputPath: new OsPath("C:\\Watch\\x"),
    });

    await client.removeItem(item, true);

    expect(diskProvider.deleteFolder).toHaveBeenCalled();
  });

  it("getStatus() returns the watch folder as the output root, localhost true", () => {
    const { client } = buildClient();
    const status = client.getStatus();
    expect(status.isLocalhost).toBe(true);
    expect(status.outputRootFolders[0]!.fullPath).toBe("C:\\Watch");
  });

  it("test() fails when the configured folders don't exist", async () => {
    const { client } = buildClient(fakeScanWatchFolder(), {
      folderExists: vi.fn(() => false),
    });

    const result = await client.test();
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "TorrentFolder")).toBe(true);
    expect(result.errors.some((e) => e.propertyName === "WatchFolder")).toBe(true);
  });

  it("test() passes when both folders exist and are writable", async () => {
    const { client } = buildClient();
    const result = await client.test();
    expect(result.isValid).toBe(true);
  });
});
