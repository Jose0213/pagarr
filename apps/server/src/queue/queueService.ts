import { createHash } from "node:crypto";
import type { IEventAggregator } from "../messaging/events/iEventAggregator.js";
import type { Book } from "../books/index.js";
import { newQualityModel, type QualityModel } from "../qualities/qualityModel.js";
import { Quality } from "../qualities/quality.js";
import { removeFileExtension } from "../parser/parser.js";
import { DownloadItemStatus } from "../download-clients/DownloadItemStatus.js";
import type { TrackedDownload } from "../download-tracking/tracked-downloads/trackedDownload.js";
import { TrackedDownloadRefreshedEvent } from "../download-tracking/tracked-downloads/trackedDownloadRefreshedEvent.js";
import {
  EntityHistoryEventType,
  type HistoryServiceLike,
} from "../download-tracking/entityHistory.js";
import type { QueueItem } from "./queue.js";
import { QueueUpdatedEvent } from "./queueUpdatedEvent.js";

/**
 * Ported from `Status = trackedDownload.DownloadItem.Status.ToString()`:
 * C# enum `.ToString()` returns the member's declared name. `
 * DownloadItemStatus` (download-clients/DownloadItemStatus.ts) is a plain
 * `const` object (not a TS `enum`, which would auto-generate a reverse
 * numeric->name lookup) -- this builds that reverse lookup once from the
 * object's own keys rather than hardcoding a duplicate name list.
 */
const DOWNLOAD_ITEM_STATUS_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(DownloadItemStatus).map(([name, value]) => [value, name])
);

function downloadItemStatusToString(status: DownloadItemStatus): string {
  return DOWNLOAD_ITEM_STATUS_NAMES[status] ?? String(status);
}

/**
 * Ported from NzbDrone.Core/Queue/QueueService.cs.
 *
 * `HashConverter.GetHashInt31` -- ported locally here (not imported from
 * `download-tracking/pending/pendingReleaseService.ts`'s identical private
 * `getHashInt31`) to keep this module's internals self-contained, matching
 * this port's existing convention of duplicating small forward-ref/utility
 * functions per-module rather than sharing them across module boundaries
 * (see `download-tracking/history/downloadHistoryService.ts`'s doc comment
 * on `releaseInfoFromDecision` for the precedent).
 */
function getHashInt31(target: string): number {
  const hash = createHash("sha1").update(target, "latin1").digest();
  return hash.readInt32LE(0) & 0x7fffffff;
}

/** Ported from NzbDrone.Core/Queue/IQueueService.cs. */
export interface IQueueService {
  getQueue(): QueueItem[];
  find(id: number): QueueItem | undefined;
  remove(id: number): void;
}

export interface QueueServiceEventAggregatorLike extends Pick<IEventAggregator, "publishEvent"> {
  publishEvent(event: QueueUpdatedEvent): void;
}

/**
 * Ported from `QueueService`. C#'s `_queue` is a `static List<Queue>` --
 * ported as a plain instance field: C#'s `static` here is an artifact of
 * how the original app wired up a single always-alive QueueService (the
 * `static` keeps the last-mapped queue available even across DI-scoped
 * instance boundaries in the ASP.NET request pipeline), not a deliberate
 * "shared across all instances" design; a single long-lived instance
 * (matching how this port constructs its other long-lived services) gives
 * the same observable behavior without a JS module-level mutable global.
 */
export class QueueService implements IQueueService {
  private queueItems: QueueItem[] = [];

  constructor(
    private readonly eventAggregator: QueueServiceEventAggregatorLike,
    private readonly historyService: HistoryServiceLike
  ) {}

  getQueue(): QueueItem[] {
    return this.queueItems;
  }

  find(id: number): QueueItem | undefined {
    return this.queueItems.find((q) => q.id === id);
  }

  remove(id: number): void {
    const item = this.find(id);
    if (item) {
      const index = this.queueItems.indexOf(item);
      this.queueItems.splice(index, 1);
    }
  }

  private *mapQueue(trackedDownload: TrackedDownload): Generator<QueueItem> {
    if (trackedDownload.remoteBook?.books && trackedDownload.remoteBook.books.length > 0) {
      for (const book of trackedDownload.remoteBook.books) {
        yield this.mapQueueItem(trackedDownload, book);
      }
    } else {
      yield this.mapQueueItem(trackedDownload, null);
    }
  }

  private mapQueueItem(trackedDownload: TrackedDownload, book: Book | null): QueueItem {
    let downloadForced = false;
    const history = this.historyService
      .find(trackedDownload.downloadItem.downloadId, EntityHistoryEventType.Grabbed)
      .find(() => true);

    if (history && Object.hasOwn(history.data, "downloadForced")) {
      downloadForced =
        history.data["downloadForced"] === "True" || history.data["downloadForced"] === "true";
    }

    const quality: QualityModel =
      trackedDownload.remoteBook?.parsedBookInfo?.quality ?? newQualityModel(Quality.Unknown);

    const timeleft = trackedDownload.downloadItem.remainingTime;

    const queueItem: QueueItem = {
      id: 0,
      author: trackedDownload.remoteBook?.author ?? null,
      book,
      quality,
      title: removeFileExtension(trackedDownload.downloadItem.title),
      size: trackedDownload.downloadItem.totalSize,
      sizeleft: trackedDownload.downloadItem.remainingSize,
      timeleft,
      status: downloadItemStatusToString(trackedDownload.downloadItem.status),
      trackedDownloadStatus: trackedDownload.status,
      trackedDownloadState: trackedDownload.state,
      statusMessages: [...trackedDownload.statusMessages],
      errorMessage: trackedDownload.downloadItem.message,
      remoteBook: trackedDownload.remoteBook,
      downloadId: trackedDownload.downloadItem.downloadId,
      protocol: trackedDownload.protocol,
      downloadClient: trackedDownload.downloadItem.downloadClientInfo?.name ?? "",
      indexer: trackedDownload.indexer ?? "",
      outputPath: trackedDownload.downloadItem.outputPath.fullPath,
      downloadForced,
      downloadClientHasPostImportCategory:
        trackedDownload.downloadItem.downloadClientInfo?.hasPostImportCategory ?? false,
      estimatedCompletionTime: null,
    };

    queueItem.id = getHashInt31(
      `trackedDownload-${trackedDownload.downloadClient}-${trackedDownload.downloadItem.downloadId}-book${book?.id ?? 0}`
    );

    if (queueItem.timeleft !== null) {
      queueItem.estimatedCompletionTime = new Date(Date.now() + queueItem.timeleft).toISOString();
    }

    return queueItem;
  }

  /** Ported from `Handle(TrackedDownloadRefreshedEvent message)`. */
  handle(message: TrackedDownloadRefreshedEvent): void {
    const trackable = message.trackedDownloads
      .filter((t) => t.isTrackable)
      .sort((a, b) => remainingTimeSortKey(a) - remainingTimeSortKey(b));

    this.queueItems = trackable.flatMap((t) => [...this.mapQueue(t)]);

    this.eventAggregator.publishEvent(new QueueUpdatedEvent());
  }
}

/**
 * Ported from `.OrderBy(c => c.DownloadItem.RemainingTime)`: C#'s
 * `TimeSpan?` ascending sort treats `null` as greater than any concrete
 * value (LINQ's default nullable-comparer semantics -- null sorts last in
 * ascending order). `remainingTime` is milliseconds-or-null here (see this
 * port's established `TimeSpan?` convention); `Infinity` reproduces
 * "sorts after every real value" for a plain numeric comparator.
 */
function remainingTimeSortKey(trackedDownload: TrackedDownload): number {
  return trackedDownload.downloadItem.remainingTime ?? Number.POSITIVE_INFINITY;
}
