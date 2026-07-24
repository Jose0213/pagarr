import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import type { QueueItem } from "../../../../queue/queue.js";
import { TrackedDownloadStatus } from "../../../../download-tracking/tracked-downloads/trackedDownload.js";
import { DownloadProtocol } from "../../../../indexers/DownloadProtocol.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { newBook } from "../../../../books/models.js";
import {
  queueDetailsController,
  type QueueDetailsControllerOptions,
} from "../QueueDetailsController.js";

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
    estimatedCompletionTime: null,
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

function buildApp(options: QueueDetailsControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/queue/details", queueDetailsController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("queueDetailsController", () => {
  it("returns the full queue (tracked + pending) with no filters", async () => {
    const tracked = [buildQueueItem({ id: 1 })];
    const pending = [buildQueueItem({ id: 2 })];
    const app = buildApp({
      queueService: { getQueue: () => tracked, find: () => undefined, remove: () => {} },
      pendingReleaseService: {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => pending,
        removePendingQueueItems: () => {},
      },
      resolveQualityProfile: () => undefined,
    });

    const res = await request(app).get("/queue/details");

    expect(res.status).toBe(200);
    expect((res.body as { id: number }[]).map((r) => r.id)).toEqual([1, 2]);
  });

  it("filters by authorId when supplied", async () => {
    const items = [
      buildQueueItem({ id: 1, author: { id: 5 } as never }),
      buildQueueItem({ id: 2, author: { id: 6 } as never }),
    ];
    const app = buildApp({
      queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      pendingReleaseService: {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => [],
        removePendingQueueItems: () => {},
      },
      resolveQualityProfile: () => undefined,
    });

    const res = await request(app).get("/queue/details?authorId=5");

    expect((res.body as { id: number }[]).map((r) => r.id)).toEqual([1]);
  });

  it("filters by bookIds when authorId is absent", async () => {
    const items = [
      buildQueueItem({ id: 1, book: { ...newBook(), id: 100 } }),
      buildQueueItem({ id: 2, book: { ...newBook(), id: 200 } }),
      buildQueueItem({ id: 3, book: null }),
    ];
    const app = buildApp({
      queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      pendingReleaseService: {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => [],
        removePendingQueueItems: () => {},
      },
      resolveQualityProfile: () => undefined,
    });

    const res = await request(app).get("/queue/details?bookIds=100");

    expect((res.body as { id: number }[]).map((r) => r.id)).toEqual([1]);
  });

  it("includeBook defaults to true", async () => {
    const items = [buildQueueItem({ id: 1, book: { ...newBook(), id: 100, title: "T" } })];
    const app = buildApp({
      queueService: { getQueue: () => items, find: () => undefined, remove: () => {} },
      pendingReleaseService: {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => [],
        removePendingQueueItems: () => {},
      },
      resolveQualityProfile: () => undefined,
    });

    const res = await request(app).get("/queue/details");

    expect(res.body[0].book).not.toBeNull();
  });
});
