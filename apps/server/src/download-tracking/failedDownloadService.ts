import {
  ENTITY_HISTORY_DOWNLOAD_CLIENT,
  ENTITY_HISTORY_RELEASE_SOURCE,
  EntityHistoryEventType,
  type EntityHistoryRecord,
  type HistoryServiceLike,
} from "./entityHistory.js";
import { DownloadFailedEvent } from "./events.js";
import { DownloadItemStatus } from "./downloadClients.js";
import { TrackedDownloadState, type TrackedDownload } from "./tracked-downloads/trackedDownload.js";
import type { ITrackedDownloadService } from "./tracked-downloads/trackedDownloadService.js";
import { ReleaseSourceType } from "../parser/model/releaseInfo.js";

/**
 * Ported from NzbDrone.Core/Download/FailedDownloadService.cs.
 *
 * `_historyService.Get(historyId)`/`.Find(downloadId, eventType)` use the
 * same `HistoryServiceLike` forward-ref as `entityHistory.ts` -- narrowed
 * further here since `FailedDownloadService` also needs `.get(historyId)`.
 */
export interface IFailedDownloadService {
  markAsFailedByHistoryId(historyId: number, skipRedownload?: boolean): void;
  markAsFailedByDownloadId(downloadId: string, skipRedownload?: boolean): void;
  check(trackedDownload: TrackedDownload): void;
  processFailed(trackedDownload: TrackedDownload): void;
}

export interface DownloadFailedEventAggregatorLike {
  publishEvent(event: DownloadFailedEvent): void;
}

export class FailedDownloadService implements IFailedDownloadService {
  constructor(
    private readonly historyService: HistoryServiceLike,
    private readonly trackedDownloadService: ITrackedDownloadService,
    private readonly eventAggregator: DownloadFailedEventAggregatorLike
  ) {}

  markAsFailedByHistoryId(historyId: number, skipRedownload = false): void {
    const history = this.historyService.get(historyId);

    const downloadId = history.downloadId;
    if (!downloadId || downloadId.trim() === "") {
      this.publishDownloadFailedEvent([history], "Manually marked as failed", null, skipRedownload);
    } else {
      const grabbedHistory = this.historyService.find(downloadId, EntityHistoryEventType.Grabbed);
      this.publishDownloadFailedEvent(grabbedHistory, "Manually marked as failed", null, false);
    }
  }

  markAsFailedByDownloadId(downloadId: string, skipRedownload = false): void {
    const history = this.historyService.find(downloadId, EntityHistoryEventType.Grabbed);

    if (history.length > 0) {
      const trackedDownload = this.trackedDownloadService.find(downloadId) ?? null;
      this.publishDownloadFailedEvent(
        history,
        "Manually marked as failed",
        trackedDownload,
        skipRedownload
      );
    }
  }

  check(trackedDownload: TrackedDownload): void {
    // Only process tracked downloads that are still downloading.
    if (trackedDownload.state !== TrackedDownloadState.Downloading) {
      return;
    }

    if (
      trackedDownload.downloadItem.isEncrypted ||
      trackedDownload.downloadItem.status === DownloadItemStatus.Failed
    ) {
      const grabbedItems = this.historyService.find(
        trackedDownload.downloadItem.downloadId,
        EntityHistoryEventType.Grabbed
      );

      if (grabbedItems.length === 0) {
        return;
      }

      trackedDownload.state = TrackedDownloadState.DownloadFailedPending;
    }
  }

  processFailed(trackedDownload: TrackedDownload): void {
    if (trackedDownload.state !== TrackedDownloadState.DownloadFailedPending) {
      return;
    }

    const grabbedItems = this.historyService.find(
      trackedDownload.downloadItem.downloadId,
      EntityHistoryEventType.Grabbed
    );

    if (grabbedItems.length === 0) {
      return;
    }

    let failure = "Failed download detected";

    if (trackedDownload.downloadItem.isEncrypted) {
      failure = "Encrypted download detected";
    } else if (
      trackedDownload.downloadItem.status === DownloadItemStatus.Failed &&
      trackedDownload.downloadItem.message &&
      trackedDownload.downloadItem.message.trim() !== ""
    ) {
      failure = trackedDownload.downloadItem.message;
    }

    trackedDownload.state = TrackedDownloadState.DownloadFailed;
    this.publishDownloadFailedEvent(grabbedItems, failure, trackedDownload, false);
  }

  private publishDownloadFailedEvent(
    historyItems: EntityHistoryRecord[],
    message: string,
    trackedDownload: TrackedDownload | null,
    skipRedownload: boolean
  ): void {
    const historyItem = historyItems[historyItems.length - 1];
    if (!historyItem) {
      throw new Error("historyItems must not be empty");
    }

    const releaseSourceRaw = historyItem.data[ENTITY_HISTORY_RELEASE_SOURCE] ?? "Unknown";
    const releaseSource = parseReleaseSourceType(releaseSourceRaw);

    const downloadFailedEvent = new DownloadFailedEvent();
    downloadFailedEvent.authorId = historyItem.authorId;
    downloadFailedEvent.bookIds = historyItems.map((h) => h.bookId);
    downloadFailedEvent.quality = historyItem.quality;
    downloadFailedEvent.sourceTitle = historyItem.sourceTitle;
    downloadFailedEvent.downloadClient = historyItem.data[ENTITY_HISTORY_DOWNLOAD_CLIENT] ?? null;
    downloadFailedEvent.downloadId = historyItem.downloadId;
    downloadFailedEvent.message = message;
    downloadFailedEvent.data = historyItem.data as Record<string, string>;
    downloadFailedEvent.trackedDownload = trackedDownload;
    downloadFailedEvent.skipRedownload = skipRedownload;
    downloadFailedEvent.releaseSource = releaseSource;

    this.eventAggregator.publishEvent(downloadFailedEvent);
  }
}

/** Ported from `Enum.TryParse(historyItem.Data.GetValueOrDefault(EntityHistory.RELEASE_SOURCE, ReleaseSourceType.Unknown.ToString()), out ReleaseSourceType releaseSource)`. */
function parseReleaseSourceType(raw: string): ReleaseSourceType {
  const match = Object.entries(ReleaseSourceType).find(
    ([key, value]) => typeof value === "number" && key.toLowerCase() === raw.toLowerCase()
  );
  return match ? (match[1] as ReleaseSourceType) : ReleaseSourceType.Unknown;
}
