import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import type { QueueItem } from "../../../../queue/queue.js";
import { TrackedDownloadStatus } from "../../../../download-tracking/tracked-downloads/trackedDownload.js";
import { DownloadProtocol } from "../../../../indexers/DownloadProtocol.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import {
  queueActionController,
  type QueueActionControllerOptions,
} from "../QueueActionController.js";

function buildQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 1,
    author: null,
    book: null,
    quality: newQualityModel(Quality.MP3_320),
    size: 1000,
    title: "Some Book",
    sizeleft: 500,
    timeleft: null,
    estimatedCompletionTime: null,
    status: "delay",
    trackedDownloadStatus: TrackedDownloadStatus.Ok,
    trackedDownloadState: null,
    statusMessages: [],
    downloadId: null,
    remoteBook: { books: [] } as never,
    protocol: DownloadProtocol.Usenet,
    downloadClient: null,
    downloadClientHasPostImportCategory: false,
    indexer: "Indexer1",
    outputPath: null,
    errorMessage: null,
    downloadForced: false,
    ...overrides,
  };
}

function buildApp(options: QueueActionControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/queue", queueActionController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("queueActionController", () => {
  describe("POST /grab/:id", () => {
    it("downloads the pending release's remote book and returns {}", async () => {
      const pendingItem = buildQueueItem({ id: 5 });
      const downloadReport = vi.fn().mockResolvedValue(undefined);
      const app = buildApp({
        pendingReleaseService: {
          findPendingQueueItem: (id) => (id === 5 ? pendingItem : undefined),
          getPendingQueue: () => [],
          removePendingQueueItems: () => {},
        },
        downloadService: { downloadReport },
      });

      const res = await request(app).post("/queue/grab/5");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(downloadReport).toHaveBeenCalledWith(pendingItem.remoteBook, null);
    });

    it("404s when there is no pending release for the id", async () => {
      const app = buildApp({
        pendingReleaseService: {
          findPendingQueueItem: () => undefined,
          getPendingQueue: () => [],
          removePendingQueueItems: () => {},
        },
        downloadService: { downloadReport: vi.fn() },
      });

      const res = await request(app).post("/queue/grab/999");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /grab/bulk", () => {
    it("downloads every id's pending release", async () => {
      const item1 = buildQueueItem({ id: 1 });
      const item2 = buildQueueItem({ id: 2 });
      const downloadReport = vi.fn().mockResolvedValue(undefined);
      const app = buildApp({
        pendingReleaseService: {
          findPendingQueueItem: (id) => (id === 1 ? item1 : id === 2 ? item2 : undefined),
          getPendingQueue: () => [],
          removePendingQueueItems: () => {},
        },
        downloadService: { downloadReport },
      });

      const res = await request(app)
        .post("/queue/grab/bulk")
        .send({ ids: [1, 2] });

      expect(res.status).toBe(200);
      expect(downloadReport).toHaveBeenCalledTimes(2);
    });

    it("404s as soon as one id has no pending release", async () => {
      const item1 = buildQueueItem({ id: 1 });
      const downloadReport = vi.fn().mockResolvedValue(undefined);
      const app = buildApp({
        pendingReleaseService: {
          findPendingQueueItem: (id) => (id === 1 ? item1 : undefined),
          getPendingQueue: () => [],
          removePendingQueueItems: () => {},
        },
        downloadService: { downloadReport },
      });

      const res = await request(app)
        .post("/queue/grab/bulk")
        .send({ ids: [1, 999] });

      expect(res.status).toBe(404);
    });
  });
});
