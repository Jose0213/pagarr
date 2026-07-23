import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { createDownloadClientDefinition } from "../../DownloadClientDefinition.js";
import { DownloadItemStatus } from "../../DownloadItemStatus.js";
import { QBittorrent } from "../../qbittorrent/QBittorrent.js";
import { createQBittorrentPreferences } from "../../qbittorrent/QBittorrentPreferences.js";
import { QBittorrentPriority } from "../../qbittorrent/QBittorrentPriority.js";
import { createQBittorrentSettings } from "../../qbittorrent/QBittorrentSettings.js";
import { createQBittorrentTorrent } from "../../qbittorrent/QBittorrentTorrent.js";
import type {
  IQBittorrentProxy,
  IQBittorrentProxySelector,
} from "../../qbittorrent/QBittorrentProxySelector.js";
import { createDownloadClientItem } from "../../DownloadClientItem.js";
import { OsPath } from "../../OsPath.js";
import { identityRemotePathMappingService } from "../../RemotePathMappingService.js";
import {
  fakeConfigService,
  fakeDiskProvider,
  fakeHttpClient,
  createTestRemoteBook,
} from "../testFixtures.js";

const TITLE = "Droned.S01E01.Pilot.1080p.WEB-DL-DRONE";

// A real bencoded .torrent file with a single-file info dict, so
// getHashFromTorrentFile() can compute a real SHA-1 info-hash from it.
function fakeTorrentFileBytes(): Uint8Array {
  const bencoded = "d8:announce3:foo4:infod6:lengthi100e4:name5:filesee";
  return new TextEncoder().encode(bencoded);
}

function fakeProxy(overrides: Partial<IQBittorrentProxy> = {}): IQBittorrentProxy {
  return {
    isApiSupported: vi.fn(async () => true),
    getApiVersion: vi.fn(async () => "2.8.1"),
    getVersion: vi.fn(async () => "4.3.1"),
    getConfig: vi.fn(async () => createQBittorrentPreferences({ dht: true })),
    getTorrents: vi.fn(async () => []),
    isTorrentLoaded: vi.fn(async () => true),
    getTorrentProperties: vi.fn(async () => ({ hash: "HASH", save_path: "", seeding_time: 0 })),
    getTorrentFiles: vi.fn(async () => []),
    addTorrentFromUrl: vi.fn(async () => {}),
    addTorrentFromFile: vi.fn(async () => {}),
    removeTorrent: vi.fn(async () => {}),
    setTorrentLabel: vi.fn(async () => {}),
    addLabel: vi.fn(async () => {}),
    getLabels: vi.fn(async () => ({})),
    setTorrentSeedingConfiguration: vi.fn(async () => {}),
    moveTorrentToTopInQueue: vi.fn(async () => {}),
    setForceStart: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeProxySelector(proxy: IQBittorrentProxy): IQBittorrentProxySelector {
  return {
    getProxy: vi.fn(async () => proxy),
    getApiVersion: vi.fn(async () => proxy.getApiVersion(createQBittorrentSettings())),
  };
}

function buildClient(proxyOverrides: Partial<IQBittorrentProxy> = {}) {
  const proxy = fakeProxy(proxyOverrides);
  const proxySelector = fakeProxySelector(proxy);
  const client = new QBittorrent(
    proxySelector,
    fakeHttpClient({
      get: vi.fn(
        async (req) => new HttpResponse(req, new HttpHeader(), fakeTorrentFileBytes(), 200)
      ),
    }),
    fakeConfigService(),
    fakeDiskProvider(),
    identityRemotePathMappingService
  );
  client.definition = createDownloadClientDefinition({
    id: 1,
    name: "TestQBit",
    implementation: "QBittorrent",
    settings: createQBittorrentSettings({
      host: "127.0.0.1",
      port: 2222,
      username: "admin",
      password: "pass",
      musicCategory: "music",
    }),
  });
  return { client, proxy, proxySelector };
}

function baseTorrent(overrides: Partial<ReturnType<typeof createQBittorrentTorrent>> = {}) {
  return createQBittorrentTorrent({
    hash: "HASH",
    name: TITLE,
    size: 1000,
    progress: 0.7,
    eta: 8640000,
    label: "",
    // content_path != save_path so the API>=2.6.1 "use content path" branch
    // in getItems() doesn't hit its "path matches base dir" Warning
    // override -- see QBittorrent.ts's getItems() switch statement.
    save_path: "C:\\Downloads",
    content_path: "C:\\Downloads\\Show",
    ...overrides,
  });
}

describe("QBittorrent", () => {
  describe("getItems() status mapping", () => {
    it("maps state 'error' to Warning", async () => {
      const { client } = buildClient({
        getTorrents: vi.fn(async () => [baseTorrent({ state: "error" })]),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Warning);
    });

    it.each(["pausedDL", "stoppedDL"])(
      "maps state '%s' to Paused with no remainingTime",
      async (state) => {
        const { client } = buildClient({
          getTorrents: vi.fn(async () => [baseTorrent({ state })]),
        });
        const [item] = await client.getItems();
        expect(item!.status).toBe(DownloadItemStatus.Paused);
        expect(item!.remainingTime).toBeNull();
      }
    );

    it.each(["pausedUP", "stoppedUP", "queuedUP", "uploading", "stalledUP", "forcedUP"])(
      "maps state '%s' to Completed with zero remainingTime",
      async (state) => {
        const { client } = buildClient({
          getTorrents: vi.fn(async () => [baseTorrent({ state, progress: 1.0 })]),
        });
        const [item] = await client.getItems();
        expect(item!.status).toBe(DownloadItemStatus.Completed);
        expect(item!.remainingTime).toBe(0);
      }
    );

    it.each(["queuedDL", "checkingDL", "checkingUP", "metaDL", "checkingResumeData"])(
      "maps state '%s' to Queued",
      async (state) => {
        const { client } = buildClient({
          getTorrents: vi.fn(async () => [baseTorrent({ state })]),
        });
        const [item] = await client.getItems();
        expect(item!.status).toBe(DownloadItemStatus.Queued);
        expect(item!.remainingTime).toBeNull();
      }
    );

    it("maps state 'downloading' to Downloading with a non-null remainingTime", async () => {
      const { client } = buildClient({
        getTorrents: vi.fn(async () => [baseTorrent({ state: "downloading", eta: 60 })]),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Downloading);
      expect(item!.remainingTime).not.toBeNull();
    });

    it("maps state 'stalledDL' to Warning with no remainingTime", async () => {
      const { client } = buildClient({
        getTorrents: vi.fn(async () => [baseTorrent({ state: "stalledDL" })]),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Warning);
      expect(item!.remainingTime).toBeNull();
    });

    it("maps state 'missingFiles' to Warning", async () => {
      const { client } = buildClient({
        getTorrents: vi.fn(async () => [baseTorrent({ state: "missingFiles" })]),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Warning);
      expect(item!.remainingTime).toBeNull();
    });

    it("maps metaDL to Queued when DHT is enabled, Warning when disabled", async () => {
      const { client: clientDht } = buildClient({
        getTorrents: vi.fn(async () => [baseTorrent({ state: "metaDL" })]),
        getConfig: vi.fn(async () => createQBittorrentPreferences({ dht: true })),
      });
      const [dhtItem] = await clientDht.getItems();
      expect(dhtItem!.status).toBe(DownloadItemStatus.Queued);

      const { client: clientNoDht } = buildClient({
        getTorrents: vi.fn(async () => [baseTorrent({ state: "metaDL" })]),
        getConfig: vi.fn(async () => createQBittorrentPreferences({ dht: false })),
      });
      const [noDhtItem] = await clientNoDht.getItems();
      expect(noDhtItem!.status).toBe(DownloadItemStatus.Warning);
    });

    it("gets category from the category field first, falling back to label", async () => {
      const { client: withCategory } = buildClient({
        getTorrents: vi.fn(async () => [
          baseTorrent({ state: "pausedUP", category: "music-readarr" }),
        ]),
        getConfig: vi.fn(async () => createQBittorrentPreferences({ max_ratio_enabled: false })),
      });
      const [itemWithCategory] = await withCategory.getItems();
      expect(itemWithCategory!.category).toBe("music-readarr");

      const { client: withLabelOnly } = buildClient({
        getTorrents: vi.fn(async () => [
          baseTorrent({ state: "pausedUP", label: "music-readarr" }),
        ]),
        getConfig: vi.fn(async () => createQBittorrentPreferences({ max_ratio_enabled: false })),
      });
      const [itemWithLabel] = await withLabelOnly.getItems();
      expect(itemWithLabel!.category).toBe("music-readarr");
    });
  });

  describe("getImportItem()", () => {
    it("resolves the output path from a single-file torrent, sanitizing the name", async () => {
      const { client, proxy } = buildClient();
      proxy.getTorrentFiles = vi.fn(async () => [{ name: "Sanitized.mkv" }]);
      proxy.getTorrentProperties = vi.fn(async () => ({
        hash: "HASH",
        save_path: "C:\\Torrents",
        seeding_time: 0,
      }));

      const item = createDownloadClientItem({
        downloadId: "HASH",
        outputPath: OsPath.empty(),
      });

      const result = await client.getImportItem(item, null);
      expect(result.outputPath.fullPath).toBe("C:\\Torrents\\Sanitized.mkv");
    });

    it("only keeps the first subfolder for a multi-file torrent", async () => {
      const { client, proxy } = buildClient();
      proxy.getTorrentFiles = vi.fn(async () => [
        { name: "Folder/File1.mkv" },
        { name: "Folder/File2.mkv" },
      ]);
      proxy.getTorrentProperties = vi.fn(async () => ({
        hash: "HASH",
        save_path: "C:\\Torrents",
        seeding_time: 0,
      }));

      const item = createDownloadClientItem({ downloadId: "HASH", outputPath: OsPath.empty() });

      const result = await client.getImportItem(item, null);
      expect(result.outputPath.fullPath).toBe("C:\\Torrents\\Folder");
    });

    it("uses the already-populated outputPath (API >= 2.6.1) without calling the proxy", async () => {
      const { client, proxy } = buildClient();

      const item = createDownloadClientItem({
        downloadId: "HASH",
        outputPath: new OsPath("C:\\Torrents\\AlreadySet"),
      });

      const result = await client.getImportItem(item, null);
      expect(result.outputPath.fullPath).toBe("C:\\Torrents\\AlreadySet");
      expect(proxy.getTorrentFiles).not.toHaveBeenCalled();
    });
  });

  describe("download()", () => {
    it("returns a non-empty id on successful download", async () => {
      const { client, proxy } = buildClient({
        addTorrentFromFile: vi.fn(async () => {
          (proxy.getTorrents as ReturnType<typeof vi.fn>).mockResolvedValue([
            baseTorrent({ hash: "CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951", state: "queuedUP" }),
          ]);
        }),
      });

      const remoteBook = createTestRemoteBook();
      const id = await client.download(remoteBook, null);

      expect(id).toBeTruthy();
    });

    it("extracts the hash from a magnet URL", async () => {
      const { client } = buildClient();

      const remoteBook = createTestRemoteBook({
        release: {
          ...createTestRemoteBook().release,
          downloadUrl: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp",
        },
      });

      const id = await client.download(remoteBook, null);
      expect(id).toBe("CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951");
    });

    it("refuses a magnet without trackers when DHT is disabled", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () => createQBittorrentPreferences({ dht: false })),
      });

      const remoteBook = createTestRemoteBook({
        release: {
          ...createTestRemoteBook().release,
          downloadUrl: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951",
        },
      });

      await expect(client.download(remoteBook, null)).rejects.toThrow();
    });

    it("accepts a magnet with trackers even when DHT is disabled", async () => {
      const { client, proxy } = buildClient({
        getConfig: vi.fn(async () => createQBittorrentPreferences({ dht: false })),
      });

      const remoteBook = createTestRemoteBook({
        release: {
          ...createTestRemoteBook().release,
          downloadUrl: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp://abc",
        },
      });

      await expect(client.download(remoteBook, null)).resolves.toBeTruthy();
      expect(proxy.addTorrentFromUrl).toHaveBeenCalledTimes(1);
    });

    it("moves to the top of the queue when priority is First for a recent book", async () => {
      const { client, proxy } = buildClient({
        addTorrentFromFile: vi.fn(async () => {
          (proxy.getTorrents as ReturnType<typeof vi.fn>).mockResolvedValue([
            baseTorrent({ hash: "CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951", state: "queuedUP" }),
          ]);
        }),
      });
      (
        client.definition.settings as ReturnType<typeof createQBittorrentSettings>
      ).recentTvPriority = QBittorrentPriority.First;
      (client.definition.settings as ReturnType<typeof createQBittorrentSettings>).olderTvPriority =
        QBittorrentPriority.First;

      await client.download(createTestRemoteBook(), null);

      expect(proxy.moveTorrentToTopInQueue).toHaveBeenCalledTimes(1);
    });

    it("does not fail the download if moving to top priority throws", async () => {
      const { client, proxy } = buildClient({
        addTorrentFromFile: vi.fn(async () => {
          (proxy.getTorrents as ReturnType<typeof vi.fn>).mockResolvedValue([
            baseTorrent({ hash: "CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951", state: "queuedUP" }),
          ]);
        }),
        moveTorrentToTopInQueue: vi.fn(async () => {
          throw new Error("boom");
        }),
      });
      (
        client.definition.settings as ReturnType<typeof createQBittorrentSettings>
      ).recentTvPriority = QBittorrentPriority.First;
      (client.definition.settings as ReturnType<typeof createQBittorrentSettings>).olderTvPriority =
        QBittorrentPriority.First;

      const id = await client.download(createTestRemoteBook(), null);
      expect(id).toBeTruthy();
    });
  });

  describe("getStatus()", () => {
    it("returns isLocalhost + outputRootFolders from the configured save path", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ save_path: "C:\\Downloads\\Finished\\QBittorrent" })
        ),
      });

      const status = await client.getStatus();
      expect(status.isLocalhost).toBe(true);
      expect(status.outputRootFolders[0]!.fullPath).toBe("C:\\Downloads\\Finished\\QBittorrent");
    });

    it("uses the category's own save path when set (including UNC double-slash correction)", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ save_path: "C:\\Downloads\\Finished\\QBittorrent" })
        ),
        getApiVersion: vi.fn(async () => "2.0"),
        getLabels: vi.fn(async () => ({
          music: { name: "music", savePath: "//server/store/downloads" },
        })),
      });

      const status = await client.getStatus();
      expect(status.outputRootFolders[0]!.fullPath).toBe("\\\\server\\store\\downloads");
    });
  });

  describe("seed limit / removable logic", () => {
    function completedTorrent(
      overrides: Partial<ReturnType<typeof createQBittorrentTorrent>> = {}
    ) {
      return baseTorrent({
        state: "pausedUP",
        progress: 1.0,
        ratio: 0.1,
        ratio_limit: -2,
        seeding_time_limit: -2,
        inactive_seeding_time_limit: -2,
        last_activity: Math.trunc(Date.now() / 1000),
        ...overrides,
      });
    }

    it("is not removable when the global max ratio is not reached and not paused", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ max_ratio_enabled: true, max_ratio: 1.0 })
        ),
        getTorrents: vi.fn(async () => [
          baseTorrent({ state: "uploading", progress: 1.0, ratio: 0.5 }),
        ]),
      });
      const [item] = await client.getItems();
      expect(item!.canBeRemoved).toBe(false);
      expect(item!.canMoveFiles).toBe(false);
    });

    it.each(["pausedUP", "stoppedUP"])(
      "is removable when max ratio is reached and paused (%s)",
      async (state) => {
        const { client } = buildClient({
          getConfig: vi.fn(async () =>
            createQBittorrentPreferences({ max_ratio_enabled: true, max_ratio: 1.0 })
          ),
          getTorrents: vi.fn(async () => [completedTorrent({ state, ratio: 1.0 })]),
        });
        const [item] = await client.getItems();
        expect(item!.canBeRemoved).toBe(true);
        expect(item!.canMoveFiles).toBe(true);
      }
    );

    it("is removable when ratio is reached after floating point rounding", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ max_ratio_enabled: true, max_ratio: 1.0 })
        ),
        getTorrents: vi.fn(async () => [
          completedTorrent({ state: "pausedUP", ratio: 1.1006066990976857 }),
        ]),
      });
      const [item] = await client.getItems();
      expect(item!.canBeRemoved).toBe(true);
    });

    it("respects a per-torrent overridden ratio limit", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ max_ratio_enabled: true, max_ratio: 2.0 })
        ),
        getTorrents: vi.fn(async () => [
          completedTorrent({ state: "pausedUP", ratio: 1.0, ratio_limit: 0.8 }),
        ]),
      });
      const [item] = await client.getItems();
      expect(item!.canBeRemoved).toBe(true);
    });

    it("is not removable when the overridden ratio is not yet reached", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ max_ratio_enabled: true, max_ratio: 0.2 })
        ),
        getTorrents: vi.fn(async () => [
          completedTorrent({ state: "pausedUP", ratio: 0.5, ratio_limit: 0.8 }),
        ]),
      });
      const [item] = await client.getItems();
      expect(item!.canBeRemoved).toBe(false);
    });

    it("is removable when max seeding time is reached and paused", async () => {
      const { client, proxy } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({ max_seeding_time_enabled: true, max_seeding_time: 20 })
        ),
        getTorrents: vi.fn(async () => [
          completedTorrent({ state: "pausedUP", ratio: 2.0, seeding_time: null }),
        ]),
      });
      proxy.getTorrentProperties = vi.fn(async () => ({
        hash: "HASH",
        save_path: "",
        seeding_time: 20 * 60,
      }));

      const [item] = await client.getItems();
      expect(item!.canBeRemoved).toBe(true);
    });

    it("is removable when max inactive seeding time is reached and paused", async () => {
      const twentyFiveMinutesAgo = Math.trunc(Date.now() / 1000) - 25 * 60;
      const { client } = buildClient({
        getConfig: vi.fn(async () =>
          createQBittorrentPreferences({
            max_inactive_seeding_time_enabled: true,
            max_inactive_seeding_time: 20,
          })
        ),
        getTorrents: vi.fn(async () => [
          completedTorrent({ state: "pausedUP", ratio: 2.0, last_activity: twentyFiveMinutesAgo }),
        ]),
      });
      const [item] = await client.getItems();
      expect(item!.canBeRemoved).toBe(true);
    });
  });

  describe("markItemAsImported()", () => {
    it("sets the post-import category when different from the download category", async () => {
      const { client, proxy } = buildClient();
      (
        client.definition.settings as ReturnType<typeof createQBittorrentSettings>
      ).musicImportedCategory = "music-imported";

      const item = createDownloadClientItem({ downloadId: "HASH", title: "Test" });

      await client.markItemAsImported(item);

      expect(proxy.setTorrentLabel).toHaveBeenCalledWith(
        "hash",
        "music-imported",
        expect.anything()
      );
    });

    it("does nothing when musicImportedCategory is not configured", async () => {
      const { client, proxy } = buildClient();

      const item = createDownloadClientItem({ downloadId: "HASH", title: "Test" });

      await client.markItemAsImported(item);

      expect(proxy.setTorrentLabel).not.toHaveBeenCalled();
    });
  });
});
