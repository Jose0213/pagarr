import { describe, expect, it, vi } from "vitest";
import { FailedDownloadService } from "../failedDownloadService.js";
import { TrackedDownload, TrackedDownloadState } from "../tracked-downloads/trackedDownload.js";
import { newRemoteBook } from "../../parser/model/remoteBook.js";
import { newAuthor, newBook } from "../../books/models.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import { DownloadItemStatus, type DownloadClientItem } from "../downloadClients.js";
import { OsPath } from "../../download-clients/OsPath.js";
import {
  EntityHistoryEventType,
  type EntityHistoryRecord,
  type HistoryServiceLike,
} from "../entityHistory.js";
import type { ITrackedDownloadService } from "../tracked-downloads/trackedDownloadService.js";

function makeItem(overrides: Partial<DownloadClientItem> = {}): DownloadClientItem {
  return {
    downloadClientInfo: {
      protocol: DownloadProtocol.Torrent,
      type: "T",
      id: 1,
      name: "Client",
      hasPostImportCategory: false,
    },
    downloadId: "dl-1",
    category: null,
    title: "Drone.DroneTheBook.FLAC",
    totalSize: 0,
    remainingSize: 0,
    remainingTime: null,
    seedRatio: null,
    outputPath: new OsPath("C:\\DropFolder\\MyDownload"),
    message: null,
    status: DownloadItemStatus.Completed,
    isEncrypted: false,
    canMoveFiles: true,
    canBeRemoved: true,
    removed: false,
    ...overrides,
  };
}

function makeHistoryItem(overrides: Partial<EntityHistoryRecord> = {}): EntityHistoryRecord {
  return {
    id: 1,
    bookId: 1,
    authorId: 1,
    sourceTitle: "t",
    quality: {} as never,
    date: new Date().toISOString(),
    eventType: EntityHistoryEventType.Grabbed,
    data: {},
    downloadId: "dl-1",
    ...overrides,
  };
}

/** Ported (in spirit) from NzbDrone.Core.Test/Download/FailedDownloadServiceTests/ProcessFixture.cs + ProcessFailedFixture.cs. */
describe("FailedDownloadService", () => {
  function makeTrackedDownload(): TrackedDownload {
    const trackedDownload = new TrackedDownload();
    trackedDownload.state = TrackedDownloadState.Downloading;
    trackedDownload.downloadItem = makeItem();
    trackedDownload.remoteBook = {
      ...newRemoteBook(),
      author: newAuthor(),
      books: [{ ...newBook(), id: 1 }],
    };
    return trackedDownload;
  }

  describe("check()", () => {
    it("does nothing if the tracked download isn't in Downloading state", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [makeHistoryItem()],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const trackedDownloadService = {} as ITrackedDownloadService;
      const subject = new FailedDownloadService(historyService, trackedDownloadService, {
        publishEvent,
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.state = TrackedDownloadState.Imported;
      trackedDownload.downloadItem.status = DownloadItemStatus.Failed;

      subject.check(trackedDownload);

      expect(trackedDownload.state).toBe(TrackedDownloadState.Imported);
    });

    it("moves an encrypted download to DownloadFailedPending if grabbed history exists", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [makeHistoryItem()],
        findByDownloadId: () => [],
      };
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent: vi.fn(),
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.downloadItem.isEncrypted = true;

      subject.check(trackedDownload);

      expect(trackedDownload.state).toBe(TrackedDownloadState.DownloadFailedPending);
    });

    it("should_not_fail_if_matching_history_is_not_found (no grabbed history -> stays Downloading, no state change)", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.downloadItem.status = DownloadItemStatus.Failed;

      subject.check(trackedDownload);

      expect(trackedDownload.state).not.toBe(TrackedDownloadState.DownloadFailed);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("does nothing if the download is still downloading and not encrypted/failed", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [makeHistoryItem()],
        findByDownloadId: () => [],
      };
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent: vi.fn(),
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.downloadItem.status = DownloadItemStatus.Downloading;

      subject.check(trackedDownload);

      expect(trackedDownload.state).toBe(TrackedDownloadState.Downloading);
    });
  });

  describe("processFailed()", () => {
    it("publishes a DownloadFailedEvent and marks the download DownloadFailed", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [makeHistoryItem()],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.state = TrackedDownloadState.DownloadFailedPending;

      subject.processFailed(trackedDownload);

      expect(trackedDownload.state).toBe(TrackedDownloadState.DownloadFailed);
      expect(publishEvent).toHaveBeenCalledTimes(1);
    });

    it("uses 'Encrypted download detected' as the failure message for encrypted downloads", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [makeHistoryItem()],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.state = TrackedDownloadState.DownloadFailedPending;
      trackedDownload.downloadItem.isEncrypted = true;

      subject.processFailed(trackedDownload);

      const event = publishEvent.mock.calls[0]![0] as { message: string };
      expect(event.message).toBe("Encrypted download detected");
    });

    it("does nothing if not in DownloadFailedPending state", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [makeHistoryItem()],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.state = TrackedDownloadState.Downloading;

      subject.processFailed(trackedDownload);

      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("does nothing if there's no grabbed history for the download id", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      const trackedDownload = makeTrackedDownload();
      trackedDownload.state = TrackedDownloadState.DownloadFailedPending;

      subject.processFailed(trackedDownload);

      expect(publishEvent).not.toHaveBeenCalled();
      expect(trackedDownload.state).toBe(TrackedDownloadState.DownloadFailedPending);
    });
  });

  describe("markAsFailedByHistoryId()", () => {
    it("publishes directly from the history item when it has no download id", () => {
      const historyItem = makeHistoryItem({ downloadId: null });
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => historyItem,
        find: () => [],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      subject.markAsFailedByHistoryId(1);

      expect(publishEvent).toHaveBeenCalledTimes(1);
    });

    it("looks up the grabbed history batch when the history item has a download id", () => {
      const historyItem = makeHistoryItem({ downloadId: "dl-1" });
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => historyItem,
        find: () => [historyItem],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const subject = new FailedDownloadService(historyService, {} as ITrackedDownloadService, {
        publishEvent,
      });

      subject.markAsFailedByHistoryId(1);

      expect(publishEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("markAsFailedByDownloadId()", () => {
    it("publishes when grabbed history exists for the download id", () => {
      const historyItem = makeHistoryItem();
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [historyItem],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const trackedDownloadService: ITrackedDownloadService = {
        find: () => undefined,
        stopTracking: () => {},
        stopTrackingMany: () => {},
        trackDownload: () => null,
        getTrackedDownloads: () => [],
        updateTrackable: () => {},
      };
      const subject = new FailedDownloadService(historyService, trackedDownloadService, {
        publishEvent,
      });

      subject.markAsFailedByDownloadId("dl-1");

      expect(publishEvent).toHaveBeenCalledTimes(1);
    });

    it("does nothing when no grabbed history exists", () => {
      const historyService: HistoryServiceLike = {
        mostRecentForDownloadId: () => null,
        get: () => {
          throw new Error("not used");
        },
        find: () => [],
        findByDownloadId: () => [],
      };
      const publishEvent = vi.fn();
      const trackedDownloadService: ITrackedDownloadService = {
        find: () => undefined,
        stopTracking: () => {},
        stopTrackingMany: () => {},
        trackDownload: () => null,
        getTrackedDownloads: () => [],
        updateTrackable: () => {},
      };
      const subject = new FailedDownloadService(historyService, trackedDownloadService, {
        publishEvent,
      });

      subject.markAsFailedByDownloadId("dl-1");

      expect(publishEvent).not.toHaveBeenCalled();
    });
  });
});
