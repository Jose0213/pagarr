import { describe, expect, it, vi } from "vitest";
import { createDownloadClientDefinition } from "../../DownloadClientDefinition.js";
import { DownloadItemStatus } from "../../DownloadItemStatus.js";
import { createDownloadClientItem } from "../../DownloadClientItem.js";
import { identityRemotePathMappingService } from "../../RemotePathMappingService.js";
import { Sabnzbd, DownloadClientRejectedReleaseException } from "../../sabnzbd/Sabnzbd.js";
import { createSabnzbdConfig, createSabnzbdConfigMisc } from "../../sabnzbd/SabnzbdCategory.js";
import { SabnzbdDownloadStatus } from "../../sabnzbd/SabnzbdDownloadStatus.js";
import { SabnzbdPriority } from "../../sabnzbd/SabnzbdPriority.js";
import type { ISabnzbdProxy } from "../../sabnzbd/SabnzbdProxy.js";
import { createSabnzbdSettings } from "../../sabnzbd/SabnzbdSettings.js";
import type { SabnzbdQueue } from "../../sabnzbd/SabnzbdQueue.js";
import type { SabnzbdHistory } from "../../sabnzbd/SabnzbdHistory.js";
import {
  fakeConfigService,
  fakeDiskProvider,
  fakeHttpClient,
  createTestRemoteBook,
} from "../testFixtures.js";

const TITLE = "Droned.S01E01.Pilot.1080p.WEB-DL-DRONE";

function emptyQueue(): SabnzbdQueue {
  return { my_home: "Y:\\nzbget\\root", paused: false, slots: [] };
}

function emptyHistory(): SabnzbdHistory {
  return { paused: false, slots: [] };
}

function fakeProxy(overrides: Partial<ISabnzbdProxy> = {}): ISabnzbdProxy {
  return {
    getBaseUrl: vi.fn(() => "http://127.0.0.1:2222"),
    downloadNzb: vi.fn(async () => ({ status: true, nzo_ids: ["sabznbd_nzo12345"] })),
    removeFromQueue: vi.fn(async () => {}),
    removeFromHistory: vi.fn(async () => {}),
    getVersion: vi.fn(async () => "1.2.3"),
    getConfig: vi.fn(async () =>
      createSabnzbdConfig({
        misc: createSabnzbdConfigMisc({ complete_dir: "/remote/mount" }),
        categories: [
          { priority: 0, pp: "", name: "tv", script: "", dir: "vv", fullPath: undefined as never },
        ],
      })
    ),
    getFullStatus: vi.fn(async () => ({ completedir: "Y:\\nzbget\\root\\complete" })),
    getQueue: vi.fn(async () => emptyQueue()),
    getHistory: vi.fn(async () => emptyHistory()),
    retryDownload: vi.fn(async () => "id"),
    ...overrides,
  };
}

function buildClient(proxyOverrides: Partial<ISabnzbdProxy> = {}) {
  const proxy = fakeProxy(proxyOverrides);
  const client = new Sabnzbd(
    proxy,
    fakeHttpClient(),
    fakeConfigService(),
    fakeDiskProvider(),
    identityRemotePathMappingService
  );
  client.definition = createDownloadClientDefinition({
    id: 1,
    name: "TestSab",
    implementation: "Sabnzbd",
    settings: createSabnzbdSettings({
      host: "127.0.0.1",
      port: 2222,
      apiKey: "5c770e3197e4fe763423ee7c392c25d1",
      username: "admin",
      password: "pass",
      musicCategory: "tv",
      recentTvPriority: SabnzbdPriority.High,
    }),
  });
  return { client, proxy };
}

function queueWith(overrides: Partial<SabnzbdQueue["slots"][number]> = {}): SabnzbdQueue {
  return {
    my_home: "Y:\\nzbget\\root",
    paused: false,
    slots: [
      {
        status: SabnzbdDownloadStatus.Downloading,
        index: 0,
        mb: 1000,
        mbleft: 10,
        timeleft: "0:00:10",
        cat: "tv",
        nzo_id: "sabnzbd_nzb12345",
        filename: TITLE,
        priority: "Normal",
        percentage: 90,
        ...overrides,
      },
    ],
  };
}

function historyWith(overrides: Partial<SabnzbdHistory["slots"][number]> = {}): SabnzbdHistory {
  return {
    paused: false,
    slots: [
      {
        status: SabnzbdDownloadStatus.Completed,
        bytes: 1000,
        category: "tv",
        nzb_name: TITLE,
        download_time: 0,
        storage: "/remote/mount/vv/" + TITLE,
        nzo_id: "sabnzbd_nzb12345",
        name: TITLE,
        fail_message: "",
        ...overrides,
      },
    ],
  };
}

describe("Sabnzbd", () => {
  describe("getItems()", () => {
    it("returns no items when queue and history are both empty", async () => {
      const { client } = buildClient();
      expect(await client.getItems()).toEqual([]);
    });

    it.each([SabnzbdDownloadStatus.Grabbing, SabnzbdDownloadStatus.Queued])(
      "maps queue status '%s' to Queued, removable and moveable",
      async (status) => {
        const { client } = buildClient({ getQueue: vi.fn(async () => queueWith({ status })) });
        const [item] = await client.getItems();
        expect(item!.status).toBe(DownloadItemStatus.Queued);
        expect(item!.canBeRemoved).toBe(true);
        expect(item!.canMoveFiles).toBe(true);
      }
    );

    it("maps queue status 'Paused' to Paused, removable and moveable", async () => {
      const { client } = buildClient({
        getQueue: vi.fn(async () => queueWith({ status: SabnzbdDownloadStatus.Paused })),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Paused);
      expect(item!.canBeRemoved).toBe(true);
      expect(item!.canMoveFiles).toBe(true);
    });

    it.each([
      SabnzbdDownloadStatus.Checking,
      SabnzbdDownloadStatus.Downloading,
      SabnzbdDownloadStatus.QuickCheck,
      SabnzbdDownloadStatus.Verifying,
      SabnzbdDownloadStatus.Repairing,
      SabnzbdDownloadStatus.Fetching,
      SabnzbdDownloadStatus.Extracting,
      SabnzbdDownloadStatus.Moving,
      SabnzbdDownloadStatus.Running,
    ])("maps queue status '%s' to Downloading, removable and moveable", async (status) => {
      const { client } = buildClient({ getQueue: vi.fn(async () => queueWith({ status })) });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Downloading);
      expect(item!.canBeRemoved).toBe(true);
      expect(item!.canMoveFiles).toBe(true);
    });

    it("maps a completed history item to Completed, removable and moveable", async () => {
      const { client } = buildClient({ getHistory: vi.fn(async () => historyWith()) });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Completed);
      expect(item!.canBeRemoved).toBe(true);
      expect(item!.canMoveFiles).toBe(true);
    });

    it("maps a failed history item to Failed", async () => {
      const { client } = buildClient({
        getHistory: vi.fn(async () => historyWith({ status: SabnzbdDownloadStatus.Failed })),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Failed);
    });

    it("maps a failed history item with the 'unpacking failed' message to Warning instead of Failed", async () => {
      const { client } = buildClient({
        getHistory: vi.fn(async () =>
          historyWith({
            status: SabnzbdDownloadStatus.Failed,
            fail_message: "Unpacking failed, write error or disk is full?",
          })
        ),
      });
      const [item] = await client.getItems();
      expect(item!.status).toBe(DownloadItemStatus.Warning);
    });

    it("ignores a deleted queue item", async () => {
      const { client } = buildClient({
        getQueue: vi.fn(async () => queueWith({ status: SabnzbdDownloadStatus.Deleted })),
      });
      expect(await client.getItems()).toEqual([]);
    });

    it("ignores a deleted history item", async () => {
      const { client } = buildClient({
        getHistory: vi.fn(async () => historyWith({ status: SabnzbdDownloadStatus.Deleted })),
      });
      expect(await client.getItems()).toEqual([]);
    });

    it("filters out items whose category doesn't match musicCategory", async () => {
      const { client } = buildClient({
        getQueue: vi.fn(async () => queueWith({ cat: "movies" })),
      });
      expect(await client.getItems()).toEqual([]);
    });

    it("strips the 'ENCRYPTED /' prefix and marks the item encrypted", async () => {
      const { client } = buildClient({
        getQueue: vi.fn(async () => queueWith({ filename: "ENCRYPTED /" + TITLE })),
      });
      const [item] = await client.getItems();
      expect(item!.title).toBe(TITLE);
      expect(item!.isEncrypted).toBe(true);
    });

    it("paused item has null remainingTime; downloading item has a non-null remainingTime", async () => {
      const { client: pausedClient } = buildClient({
        getQueue: vi.fn(async () => queueWith({ status: SabnzbdDownloadStatus.Paused })),
      });
      const [pausedItem] = await pausedClient.getItems();
      expect(pausedItem!.remainingTime).toBeNull();

      const { client: downloadingClient } = buildClient({
        getQueue: vi.fn(async () => queueWith({ status: SabnzbdDownloadStatus.Downloading })),
      });
      const [downloadingItem] = await downloadingClient.getItems();
      expect(downloadingItem!.remainingTime).not.toBeNull();
      expect(downloadingItem!.remainingTime).not.toBe(0);
    });
  });

  describe("download()", () => {
    it("cleans the release title before using it as the nzb filename", async () => {
      const { client, proxy } = buildClient();
      const remoteBook = createTestRemoteBook({
        release: {
          ...createTestRemoteBook().release,
          title:
            "[ TOWN ]-[ http://www.town.ag ]-[ ANIME ]-[Usenet Provider >> http://www.ssl- <<] - [Commie] Aldnoah Zero 18 [234C8FC7]",
        },
      });

      await client.download(remoteBook, null);

      expect(proxy.downloadNzb).toHaveBeenCalledWith(
        expect.anything(),
        "[ TOWN ]-[ http-++www.town.ag ]-[ ANIME ]-[Usenet Provider  http-++www.ssl- ] - [Commie] Aldnoah Zero 18 [234C8FC7].nzb",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it("returns a non-empty id on successful download", async () => {
      const { client } = buildClient();
      const id = await client.download(createTestRemoteBook(), null);
      expect(id).toBeTruthy();
    });

    it("throws DownloadClientRejectedReleaseException when SABnzbd returns no ids", async () => {
      const { client } = buildClient({
        downloadNzb: vi.fn(async () => ({ status: false, nzo_ids: [] })),
      });

      await expect(client.download(createTestRemoteBook(), null)).rejects.toThrow(
        DownloadClientRejectedReleaseException
      );
    });

    it("uses recentTvPriority for a recently-released book", async () => {
      const { client, proxy } = buildClient();
      const remoteBook = createTestRemoteBook({
        books: [{ releaseDate: new Date().toISOString() }],
      });

      await client.download(remoteBook, null);

      expect(proxy.downloadNzb).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        SabnzbdPriority.High,
        expect.anything()
      );
    });
  });

  describe("removeItem()", () => {
    it("removes from the queue when the item is still queued", async () => {
      const { client, proxy } = buildClient({ getQueue: vi.fn(async () => queueWith()) });
      const item = createDownloadClientItem({
        downloadId: "sabnzbd_nzb12345",
        status: DownloadItemStatus.Downloading,
      });

      await client.removeItem(item, true);

      expect(proxy.removeFromQueue).toHaveBeenCalledWith(
        "sabnzbd_nzb12345",
        true,
        expect.anything()
      );
      expect(proxy.removeFromHistory).not.toHaveBeenCalled();
    });

    it("removes from history when the item is no longer in the queue", async () => {
      const { client, proxy } = buildClient({ getQueue: vi.fn(async () => emptyQueue()) });
      const item = createDownloadClientItem({
        downloadId: "sabnzbd_nzb12345",
        status: DownloadItemStatus.Completed,
      });

      await client.removeItem(item, true);

      expect(proxy.removeFromHistory).toHaveBeenCalledWith(
        "sabnzbd_nzb12345",
        true,
        false,
        expect.anything()
      );
    });
  });

  describe("getStatus()", () => {
    it("resolves the output root folder from the category directory under completedir", async () => {
      const { client } = buildClient({
        getVersion: vi.fn(async () => "3.0.0"),
      });

      const status = await client.getStatus();
      expect(status.isLocalhost).toBe(true);
      expect(status.outputRootFolders).toHaveLength(1);
      expect(status.outputRootFolders[0]!.fullPath).toContain("vv");
    });
  });

  describe("test()", () => {
    it("passes with a valid version and configured category", async () => {
      const { client } = buildClient({ getVersion: vi.fn(async () => "3.0.0") });
      const result = await client.test();
      expect(result.errors.filter((e) => !e.isWarning)).toEqual([]);
    });

    it("fails when the API key is incorrect", async () => {
      const { client } = buildClient({
        getConfig: vi.fn(async () => {
          throw new Error("API Key Incorrect");
        }),
      });
      const result = await client.test();
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.propertyName === "APIKey")).toBe(true);
    });

    it("warns on a 'develop' version", async () => {
      const { client } = buildClient({ getVersion: vi.fn(async () => "develop") });
      const result = await client.test();
      expect(result.errors.some((e) => e.propertyName === "Version" && e.isWarning)).toBe(true);
    });

    it("fails for a version below 0.7.0", async () => {
      const { client } = buildClient({ getVersion: vi.fn(async () => "0.6.9") });
      const result = await client.test();
      expect(result.isValid).toBe(false);
    });
  });
});
