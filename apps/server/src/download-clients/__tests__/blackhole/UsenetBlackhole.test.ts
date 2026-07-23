import { describe, expect, it, vi } from "vitest";
import { createDownloadClientDefinition } from "../../DownloadClientDefinition.js";
import { createDownloadClientItem } from "../../DownloadClientItem.js";
import { DownloadItemStatus } from "../../DownloadItemStatus.js";
import { OsPath } from "../../OsPath.js";
import { identityRemotePathMappingService } from "../../RemotePathMappingService.js";
import { UsenetBlackhole } from "../../blackhole/UsenetBlackhole.js";
import { createUsenetBlackholeSettings } from "../../blackhole/UsenetBlackholeSettings.js";
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

function buildClient(
  scanWatchFolder: IScanWatchFolder = fakeScanWatchFolder(),
  diskProviderOverrides = {}
) {
  const diskProvider = fakeDiskProvider(diskProviderOverrides);
  const client = new UsenetBlackhole(
    scanWatchFolder,
    fakeHttpClient(),
    fakeConfigService(),
    diskProvider,
    identityRemotePathMappingService
  );
  client.definition = createDownloadClientDefinition({
    id: 1,
    name: "TestUsenetBlackhole",
    implementation: "UsenetBlackhole",
    settings: createUsenetBlackholeSettings({
      nzbFolder: "C:\\Nzbs",
      watchFolder: "C:\\Watch",
    }),
  });
  return { client, diskProvider };
}

describe("UsenetBlackhole", () => {
  it("writes the .nzb file to the nzb folder", async () => {
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

    await client.download(createTestRemoteBook(), null);

    expect(writtenPath).toBe("C:\\Nzbs\\Droned.S01E01.Pilot.1080p.WEB-DL-DRONE.nzb");
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

    const items = await client.getItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.downloadId).toBe("TestUsenetBlackhole_abc_123");
    expect(items[0]!.category).toBe("Readarr");
    expect(items[0]!.canMoveFiles).toBe(true);
    expect(items[0]!.canBeRemoved).toBe(true);
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
    expect(result.errors.some((e) => e.propertyName === "NzbFolder")).toBe(true);
    expect(result.errors.some((e) => e.propertyName === "WatchFolder")).toBe(true);
  });

  it("test() passes when both folders exist and are writable", async () => {
    const { client } = buildClient();
    const result = await client.test();
    expect(result.isValid).toBe(true);
  });
});
