import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import type { QueueItem } from "../../../../queue/queue.js";
import { TrackedDownloadStatus } from "../../../../download-tracking/tracked-downloads/trackedDownload.js";
import { DownloadProtocol } from "../../../../indexers/DownloadProtocol.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { queueController, type QueueControllerOptions } from "../QueueController.js";

function buildQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 1,
    author: null,
    book: null,
    quality: newQualityModel(Quality.MP3_320),
    size: 1000,
    title: "Some Book",
    sizeleft: 500,
    timeleft: 60_000,
    estimatedCompletionTime: new Date(Date.now() + 60_000).toISOString(),
    status: "downloading",
    trackedDownloadStatus: TrackedDownloadStatus.Ok,
    trackedDownloadState: null,
    statusMessages: [],
    downloadId: "abc123",
    remoteBook: null,
    protocol: DownloadProtocol.Usenet,
    downloadClient: "Sabnzbd",
    downloadClientHasPostImportCategory: false,
    indexer: "Indexer1",
    outputPath: null,
    errorMessage: null,
    downloadForced: false,
    ...overrides,
  };
}

function buildOptions(overrides: Partial<QueueControllerOptions> = {}): QueueControllerOptions {
  return {
    queueService: { getQueue: () => [], find: () => undefined, remove: () => {} },
    pendingReleaseService: {
      findPendingQueueItem: () => undefined,
      getPendingQueue: () => [],
      removePendingQueueItems: () => {},
    },
    qualityProfileService: {
      getDefaultProfile: () => ({
        id: 0,
        name: "",
        upgradeAllowed: false,
        cutoff: 0,
        items: [],
        minFormatScore: 0,
        cutoffFormatScore: 0,
        minUpgradeFormatScore: 1,
        formatItems: [],
      }),
    },
    trackedDownloadService: {
      find: () => undefined,
      stopTracking: () => {},
      stopTrackingMany: () => {},
      trackDownload: () => null,
      getTrackedDownloads: () => [],
      updateTrackable: () => {},
    },
    failedDownloadService: {
      markAsFailedByHistoryId: () => {},
      markAsFailedByDownloadId: () => {},
      check: () => {},
      processFailed: () => {},
    },
    ignoredDownloadService: { ignoreDownload: () => true },
    downloadClientProvider: {
      get: () => {
        throw new Error("not stubbed");
      },
      getDownloadClient: () => null,
      getDownloadClients: () => [],
    },
    blocklistService: { block: () => {} },
    resolveQualityProfile: () => undefined,
    ...overrides,
  };
}

function buildApp(options: QueueControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/queue", queueController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("queueController", () => {
  describe("GET /", () => {
    it("returns a paged envelope of queue items, defaulting to page 1/pageSize 10, sortKey timeleft, sortDirection Descending", async () => {
      // Ported precedence quirk (see rest/Paging.ts's doc comment + its own
      // dedicated test coverage): a request with no
      // `sortDirection` query param resolves through PagingResource's own
      // ctor default (`SortDirection ??= Descending`) BEFORE
      // `mapToPagingSpec`'s `defaultSortDirection` argument (here,
      // `SortDirection.Ascending`, from `GetQueue`'s own
      // `MapToPagingSpec<QueueResource, Queue>("timeleft",
      // SortDirection.Ascending)` call) ever gets a chance to apply --
      // that inner override only fires when the request's OWN direction was
      // explicitly `Default`, not merely absent. So the REAL observable
      // default direction on a bare `GET /queue` is Descending, not
      // Ascending, despite the `SortDirection.Ascending` argument reading
      // like it should be the default -- ported exactly, not a bug in this
      // port.
      const items = [
        buildQueueItem({ id: 1, timeleft: 5000, author: { id: 1 } as never }),
        buildQueueItem({ id: 2, timeleft: 1000, author: { id: 1 } as never }),
        buildQueueItem({ id: 3, timeleft: 3000, author: { id: 1 } as never }),
      ];
      const options = buildOptions({
        queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      });
      const app = buildApp(options);

      const res = await request(app).get("/queue");

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(10);
      expect(res.body.sortKey).toBe("timeleft");
      expect(res.body.sortDirection).toBe("Descending");
      expect(res.body.totalRecords).toBe(3);
      // Descending timeleft: 5000, 3000, 1000 -> ids 1, 3, 2
      expect((res.body.records as { id: number }[]).map((r) => r.id)).toEqual([1, 3, 2]);
    });

    it("sorts ascending when sortDirection=Ascending is explicitly requested", async () => {
      const items = [
        buildQueueItem({ id: 1, timeleft: 5000, author: { id: 1 } as never }),
        buildQueueItem({ id: 2, timeleft: 1000, author: { id: 1 } as never }),
        buildQueueItem({ id: 3, timeleft: 3000, author: { id: 1 } as never }),
      ];
      const options = buildOptions({
        queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      });
      const app = buildApp(options);

      const res = await request(app).get("/queue?sortDirection=Ascending");

      expect(res.body.sortDirection).toBe("Ascending");
      // Ascending timeleft: 1000, 3000, 5000 -> ids 2, 3, 1
      expect((res.body.records as { id: number }[]).map((r) => r.id)).toEqual([2, 3, 1]);
    });

    it("excludes items with no author unless includeUnknownAuthorItems=true", async () => {
      const items = [
        buildQueueItem({ id: 1, author: null }),
        buildQueueItem({ id: 2, author: { id: 5 } as never }),
      ];
      const options = buildOptions({
        queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      });
      const app = buildApp(options);

      const filtered = await request(app).get("/queue");
      expect((filtered.body.records as { id: number }[]).map((r) => r.id)).toEqual([2]);

      const unfiltered = await request(app).get("/queue?includeUnknownAuthorItems=true");
      expect(unfiltered.body.totalRecords).toBe(2);
    });

    it("concatenates the pending queue onto the tracked queue", async () => {
      const tracked = [buildQueueItem({ id: 1, author: { id: 1 } as never })];
      const pending = [buildQueueItem({ id: 2, author: { id: 2 } as never })];
      const options = buildOptions({
        queueService: { getQueue: () => tracked, find: () => undefined, remove: () => {} },
        pendingReleaseService: {
          findPendingQueueItem: () => undefined,
          getPendingQueue: () => pending,
          removePendingQueueItems: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/queue");

      expect(res.body.totalRecords).toBe(2);
    });

    it("re-pages to a clamped page when the requested page is out of range", async () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        buildQueueItem({ id: i + 1, author: { id: 1 } as never })
      );
      const options = buildOptions({
        queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      });
      const app = buildApp(options);

      // 5 records, pageSize 2 -> pages 1-3 exist (3 has 1 record), page 4 is
      // empty and must recover to the clamped last page (3).
      const res = await request(app).get("/queue?page=4&pageSize=2");

      expect(res.status).toBe(200);
      expect(res.body.records.length).toBeGreaterThan(0);
      expect(res.body.page).toBe(3);
    });
  });

  describe("DELETE /:id", () => {
    it("blocklists + removes a pending release", async () => {
      const pendingItem = buildQueueItem({ id: 10, remoteBook: { books: [] } as never });
      const removePendingQueueItems = vi.fn();
      const block = vi.fn();
      const options = buildOptions({
        pendingReleaseService: {
          findPendingQueueItem: (id) => (id === 10 ? pendingItem : undefined),
          getPendingQueue: () => [],
          removePendingQueueItems,
        },
        blocklistService: { block },
      });
      const app = buildApp(options);

      const res = await request(app).delete("/queue/10");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(block).toHaveBeenCalledWith(
        pendingItem.remoteBook,
        "Pending release manually blocklisted"
      );
      expect(removePendingQueueItems).toHaveBeenCalledWith(10);
    });

    it("404s when the queue id has no pending release and no tracked download", async () => {
      const options = buildOptions();
      const app = buildApp(options);

      const res = await request(app).delete("/queue/999");

      expect(res.status).toBe(404);
    });

    it("400s for a non-positive id", async () => {
      const options = buildOptions();
      const app = buildApp(options);

      const res = await request(app).delete("/queue/0");

      expect(res.status).toBe(400);
    });

    it("removes a tracked download from the client and stops tracking it", async () => {
      const queueItem = buildQueueItem({ id: 20, downloadId: "dl-1" });
      const trackedDownload = {
        downloadClient: 1,
        downloadItem: { downloadId: "dl-1", title: "x" },
      } as never;
      const removeItem = vi.fn();
      const stopTracking = vi.fn();

      const options = buildOptions({
        queueService: {
          getQueue: () => [],
          find: (id) => (id === 20 ? queueItem : undefined),
          remove: () => {},
        },
        trackedDownloadService: {
          find: () => trackedDownload,
          stopTracking,
          stopTrackingMany: () => {},
          trackDownload: () => null,
          getTrackedDownloads: () => [],
          updateTrackable: () => {},
        },
        downloadClientProvider: {
          get: () => ({ removeItem, markItemAsImported: vi.fn() }) as never,
          getDownloadClient: () => null,
          getDownloadClients: () => [],
        },
      });
      const app = buildApp(options);

      const res = await request(app).delete("/queue/20");

      expect(res.status).toBe(200);
      expect(removeItem).toHaveBeenCalledWith(trackedDownload.downloadItem, true);
      expect(stopTracking).toHaveBeenCalledWith("dl-1");
    });
  });

  describe("DELETE /bulk", () => {
    it("removes multiple pending + tracked items, deduped by id/downloadId", async () => {
      const pending1 = buildQueueItem({ id: 1, remoteBook: null });
      const stopTrackingMany = vi.fn();
      const removePendingQueueItems = vi.fn();

      const options = buildOptions({
        pendingReleaseService: {
          findPendingQueueItem: (id) => (id === 1 ? pending1 : undefined),
          getPendingQueue: () => [],
          removePendingQueueItems,
        },
        trackedDownloadService: {
          find: () => undefined,
          stopTracking: () => {},
          stopTrackingMany,
          trackDownload: () => null,
          getTrackedDownloads: () => [],
          updateTrackable: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app)
        .delete("/queue/bulk")
        .send({ ids: [1, 1] });

      expect(res.status).toBe(200);
      expect(removePendingQueueItems).toHaveBeenCalledTimes(1);
      expect(stopTrackingMany).toHaveBeenCalledWith([]);
    });
  });
});
