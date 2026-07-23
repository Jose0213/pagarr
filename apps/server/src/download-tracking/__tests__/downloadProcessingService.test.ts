import { describe, expect, it, vi } from "vitest";
import { DownloadProcessingService } from "../downloadProcessingService.js";
import { TrackedDownload, TrackedDownloadState } from "../tracked-downloads/trackedDownload.js";
import { DownloadCanBeRemovedEvent, DownloadsProcessedEvent } from "../events.js";
import type { IConfigService } from "../../config/configService.js";
import type { ICompletedDownloadService } from "../completedDownloadService.js";
import type { IFailedDownloadService } from "../failedDownloadService.js";
import type { ITrackedDownloadService } from "../tracked-downloads/trackedDownloadService.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { DownloadClientItem } from "../downloadClients.js";
import { OsPath } from "../../download-clients/OsPath.js";

function makeItem(overrides: Partial<DownloadClientItem> = {}): DownloadClientItem {
  return {
    downloadClientInfo: {
      protocol: DownloadProtocol.Torrent,
      type: "T",
      id: 1,
      name: "C",
      hasPostImportCategory: false,
    },
    downloadId: "dl-1",
    category: null,
    title: "t",
    totalSize: 0,
    remainingSize: 0,
    remainingTime: null,
    seedRatio: null,
    outputPath: OsPath.empty(),
    message: null,
    status: 2,
    isEncrypted: false,
    canMoveFiles: true,
    canBeRemoved: true,
    removed: false,
    ...overrides,
  };
}

function makeTrackedDownload(
  state: TrackedDownloadState,
  itemOverrides: Partial<DownloadClientItem> = {}
): TrackedDownload {
  const t = new TrackedDownload();
  t.state = state;
  t.isTrackable = true;
  t.downloadItem = makeItem(itemOverrides);
  return t;
}

describe("DownloadProcessingService", () => {
  it("processes failed-pending downloads via failedDownloadService.processFailed", async () => {
    const processFailed = vi.fn();
    const trackedDownload = makeTrackedDownload(TrackedDownloadState.DownloadFailedPending);

    const configService = { enableCompletedDownloadHandling: true } as IConfigService;
    const completedDownloadService = { import: vi.fn() } as unknown as ICompletedDownloadService;
    const failedDownloadService = {
      processFailed,
      markAsFailedByHistoryId: vi.fn(),
      markAsFailedByDownloadId: vi.fn(),
      check: vi.fn(),
    } as unknown as IFailedDownloadService;
    const trackedDownloadService = {
      getTrackedDownloads: () => [trackedDownload],
    } as unknown as ITrackedDownloadService;
    const publishEvent = vi.fn();

    const subject = new DownloadProcessingService(
      configService,
      completedDownloadService,
      failedDownloadService,
      trackedDownloadService,
      { publishEvent }
    );

    await subject.execute();

    expect(processFailed).toHaveBeenCalledWith(trackedDownload);
    expect(publishEvent).toHaveBeenCalledWith(expect.any(DownloadsProcessedEvent));
  });

  it("imports import-pending downloads only when CDH is enabled", async () => {
    const importFn = vi.fn();
    const trackedDownload = makeTrackedDownload(TrackedDownloadState.ImportPending);

    const configService = { enableCompletedDownloadHandling: false } as IConfigService;
    const completedDownloadService = { import: importFn } as unknown as ICompletedDownloadService;
    const failedDownloadService = { processFailed: vi.fn() } as unknown as IFailedDownloadService;
    const trackedDownloadService = {
      getTrackedDownloads: () => [trackedDownload],
    } as unknown as ITrackedDownloadService;

    const subject = new DownloadProcessingService(
      configService,
      completedDownloadService,
      failedDownloadService,
      trackedDownloadService,
      { publishEvent: vi.fn() }
    );

    await subject.execute();

    expect(importFn).not.toHaveBeenCalled();
  });

  it("only processes trackable downloads", async () => {
    const processFailed = vi.fn();
    const trackedDownload = makeTrackedDownload(TrackedDownloadState.DownloadFailedPending);
    trackedDownload.isTrackable = false;

    const configService = { enableCompletedDownloadHandling: true } as IConfigService;
    const completedDownloadService = { import: vi.fn() } as unknown as ICompletedDownloadService;
    const failedDownloadService = { processFailed } as unknown as IFailedDownloadService;
    const trackedDownloadService = {
      getTrackedDownloads: () => [trackedDownload],
    } as unknown as ITrackedDownloadService;

    const subject = new DownloadProcessingService(
      configService,
      completedDownloadService,
      failedDownloadService,
      trackedDownloadService,
      { publishEvent: vi.fn() }
    );

    await subject.execute();

    expect(processFailed).not.toHaveBeenCalled();
  });

  it("publishes DownloadCanBeRemovedEvent for imported, removable, not-yet-removed downloads", async () => {
    const trackedDownload = makeTrackedDownload(TrackedDownloadState.Imported, {
      canBeRemoved: true,
      removed: false,
    });

    const configService = { enableCompletedDownloadHandling: true } as IConfigService;
    const completedDownloadService = { import: vi.fn() } as unknown as ICompletedDownloadService;
    const failedDownloadService = { processFailed: vi.fn() } as unknown as IFailedDownloadService;
    const trackedDownloadService = {
      getTrackedDownloads: () => [trackedDownload],
    } as unknown as ITrackedDownloadService;
    const publishEvent = vi.fn();

    const subject = new DownloadProcessingService(
      configService,
      completedDownloadService,
      failedDownloadService,
      trackedDownloadService,
      { publishEvent }
    );

    await subject.execute();

    const removableEventCalls = publishEvent.mock.calls.filter(
      (c) => c[0] instanceof DownloadCanBeRemovedEvent
    );
    expect(removableEventCalls).toHaveLength(1);
  });

  it("catches per-download errors and continues processing the rest", async () => {
    const first = makeTrackedDownload(TrackedDownloadState.DownloadFailedPending);
    const second = makeTrackedDownload(TrackedDownloadState.DownloadFailedPending);

    const processFailed = vi.fn((t: TrackedDownload) => {
      if (t === first) {
        throw new Error("boom");
      }
    });

    const configService = { enableCompletedDownloadHandling: true } as IConfigService;
    const completedDownloadService = { import: vi.fn() } as unknown as ICompletedDownloadService;
    const failedDownloadService = { processFailed } as unknown as IFailedDownloadService;
    const trackedDownloadService = {
      getTrackedDownloads: () => [first, second],
    } as unknown as ITrackedDownloadService;

    const subject = new DownloadProcessingService(
      configService,
      completedDownloadService,
      failedDownloadService,
      trackedDownloadService,
      { publishEvent: vi.fn() }
    );

    await expect(subject.execute()).resolves.not.toThrow();
    expect(processFailed).toHaveBeenCalledTimes(2);
  });
});
