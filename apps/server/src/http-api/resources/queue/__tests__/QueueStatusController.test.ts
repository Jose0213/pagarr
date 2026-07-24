import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import type { QueueItem } from "../../../../queue/queue.js";
import { TrackedDownloadStatus } from "../../../../download-tracking/tracked-downloads/trackedDownload.js";
import { DownloadProtocol } from "../../../../indexers/DownloadProtocol.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import {
  queueStatusController,
  computeQueueStatus,
  type QueueStatusControllerOptions,
} from "../QueueStatusController.js";

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

function buildApp(options: QueueStatusControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/queue/status", queueStatusController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("computeQueueStatus", () => {
  it("counts total/known/unknown and error/warning flags split by known-vs-unknown author", async () => {
    const queue = [
      buildQueueItem({
        id: 1,
        author: { id: 1 } as never,
        trackedDownloadStatus: TrackedDownloadStatus.Error,
      }),
      buildQueueItem({ id: 2, author: null, trackedDownloadStatus: TrackedDownloadStatus.Warning }),
      buildQueueItem({
        id: 3,
        author: { id: 3 } as never,
        trackedDownloadStatus: TrackedDownloadStatus.Ok,
      }),
    ];
    const pending = [buildQueueItem({ id: 4 })];

    const status = computeQueueStatus(
      { getQueue: () => queue, find: () => undefined, remove: () => {} },
      {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => pending,
        removePendingQueueItems: () => {},
      }
    );

    expect(status.totalCount).toBe(4);
    expect(status.count).toBe(3); // 2 known-author queue items + 1 pending
    expect(status.unknownCount).toBe(1);
    expect(status.errors).toBe(true);
    expect(status.unknownWarnings).toBe(true);
    expect(status.warnings).toBe(false);
    expect(status.unknownErrors).toBe(false);
  });

  it("returns all-false/zero for an empty queue", () => {
    const status = computeQueueStatus(
      { getQueue: () => [], find: () => undefined, remove: () => {} },
      {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => [],
        removePendingQueueItems: () => {},
      }
    );

    expect(status.totalCount).toBe(0);
    expect(status.count).toBe(0);
    expect(status.unknownCount).toBe(0);
    expect(status.errors).toBe(false);
    expect(status.warnings).toBe(false);
    expect(status.unknownErrors).toBe(false);
    expect(status.unknownWarnings).toBe(false);
  });
});

describe("queueStatusController", () => {
  it("GET / returns the computed status", async () => {
    const queue = [buildQueueItem({ id: 1, author: { id: 1 } as never })];
    const app = buildApp({
      queueService: { getQueue: () => queue, find: () => undefined, remove: () => {} },
      pendingReleaseService: {
        findPendingQueueItem: () => undefined,
        getPendingQueue: () => [],
        removePendingQueueItems: () => {},
      },
    });

    const res = await request(app).get("/queue/status");

    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.count).toBe(1);
  });
});
