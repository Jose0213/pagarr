import { parseBookTitle, parseBookTitleWithSearchCriteria } from "../../parser/parser.js";
import type { ParsingService } from "../../parser/parsingService.js";
import type { ParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import type { RemoteBook } from "../../parser/model/remoteBook.js";
import { IndexerFlags } from "../../parser/model/releaseInfo.js";
import type { Book } from "../../books/models.js";
import { type AuthorDeletedEvent, type BookInfoRefreshedEvent } from "../../books/events.js";
import type { DownloadClientDefinition, DownloadClientItem } from "../downloadClients.js";
import { EntityHistoryEventType, type HistoryServiceLike } from "../entityHistory.js";
import { DownloadHistoryEventType, type DownloadHistory } from "../history/downloadHistory.js";
import type { IDownloadHistoryService } from "../history/downloadHistoryService.js";
import { TrackedDownload, TrackedDownloadState, warnTrackedDownload } from "./trackedDownload.js";
import type { TrackedDownloadStatusMessage } from "./trackedDownloadStatusMessage.js";
import { TrackedDownloadRefreshedEvent } from "./trackedDownloadRefreshedEvent.js";
import { TrackedDownloadsRemovedEvent } from "./trackedDownloadsRemovedEvent.js";

/**
 * Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownloadService.cs.
 *
 * DEVIATIONS:
 *  - `ICacheManager.GetCache<TrackedDownload>(GetType())` (Common.Cache, not
 *    ported) is a plain in-memory `Map<string, TrackedDownload>` keyed by
 *    download id -- the C# cache here has no TTL/eviction (`GetCache` with
 *    no expiry argument = unbounded, matches a plain Map).
 *  - `ICustomFormatCalculationService` -- the real, ported
 *    `CustomFormatCalculationService` from `custom-formats/` is injected via
 *    a narrow `parseCustomFormatForRemoteBook`-shaped collaborator (matching
 *    that module's own `RemoteBookLike` input contract) rather than the
 *    concrete class, so this module doesn't have to construct one.
 *  - No NLog Logger / IEventAggregator swapped for a plain optional
 *    `onTrackedDownloadRefreshed` callback -- same pattern as
 *    config/configService.ts and tags/tagService.ts.
 */

export interface TrackedDownloadEventAggregatorLike {
  publishEvent(event: TrackedDownloadRefreshedEvent | TrackedDownloadsRemovedEvent): void;
}

export interface TrackedDownloadCustomFormatCalculatorLike {
  parseCustomFormatForRemoteBook(
    remoteBook: {
      parsedBookInfo: ParsedBookInfo | null;
      author: RemoteBook["author"];
      release?: { indexerFlags?: number } | null;
    },
    size: number
  ): unknown[];
}

export interface ITrackedDownloadService {
  find(downloadId: string): TrackedDownload | undefined;
  stopTracking(downloadId: string): void;
  stopTrackingMany(downloadIds: string[]): void;
  trackDownload(
    downloadClient: DownloadClientDefinition,
    downloadItem: DownloadClientItem
  ): TrackedDownload | null;
  getTrackedDownloads(): TrackedDownload[];
  updateTrackable(trackedDownloads: TrackedDownload[]): void;
}

export class TrackedDownloadService implements ITrackedDownloadService {
  private readonly cache = new Map<string, TrackedDownload>();

  constructor(
    private readonly parsingService: ParsingService,
    private readonly historyService: HistoryServiceLike,
    private readonly downloadHistoryService: IDownloadHistoryService,
    private readonly formatCalculator: TrackedDownloadCustomFormatCalculatorLike,
    private readonly eventAggregator: TrackedDownloadEventAggregatorLike = {
      publishEvent: () => {},
    }
  ) {}

  find(downloadId: string): TrackedDownload | undefined {
    return this.cache.get(downloadId);
  }

  /** Ported from `TrackedDownloadService.UpdateBookCache(int bookId)` (not part of the `ITrackedDownloadService` interface in C#, but public). */
  updateBookCache(bookId: number): void {
    const updateCacheItems = Array.from(this.cache.values()).filter(
      (t) => t.remoteBook !== null && t.remoteBook.books.some((a) => a.id === bookId)
    );

    if (updateCacheItems.length > 0) {
      for (const item of updateCacheItems) {
        const parsedBookInfo = parseBookTitle(item.downloadItem.title);
        item.remoteBook = parsedBookInfo !== null ? this.parsingService.map(parsedBookInfo) : null;
      }

      this.eventAggregator.publishEvent(
        new TrackedDownloadRefreshedEvent(this.getTrackedDownloads())
      );
    }
  }

  stopTracking(downloadId: string): void {
    const trackedDownload = this.cache.get(downloadId);
    this.cache.delete(downloadId);
    this.eventAggregator.publishEvent(
      new TrackedDownloadsRemovedEvent(trackedDownload ? [trackedDownload] : [])
    );
  }

  stopTrackingMany(downloadIds: string[]): void {
    const trackedDownloads: TrackedDownload[] = [];

    for (const downloadId of downloadIds) {
      const trackedDownload = this.cache.get(downloadId);
      this.cache.delete(downloadId);
      if (trackedDownload) {
        trackedDownloads.push(trackedDownload);
      }
    }

    this.eventAggregator.publishEvent(new TrackedDownloadsRemovedEvent(trackedDownloads));
  }

  trackDownload(
    downloadClient: DownloadClientDefinition,
    downloadItem: DownloadClientItem
  ): TrackedDownload | null {
    const existingItem = this.find(downloadItem.downloadId);

    if (existingItem !== undefined && existingItem.state !== TrackedDownloadState.Downloading) {
      this.logItemChange(existingItem, existingItem.downloadItem, downloadItem);

      existingItem.downloadItem = downloadItem;
      existingItem.isTrackable = true;

      return existingItem;
    }

    const trackedDownload = new TrackedDownload();
    trackedDownload.downloadClient = downloadClient.id;
    trackedDownload.downloadItem = downloadItem;
    trackedDownload.protocol = downloadClient.protocol;
    trackedDownload.isTrackable = true;

    try {
      let parsedBookInfo = parseBookTitle(trackedDownload.downloadItem.title);
      const historyItems = this.historyService
        .findByDownloadId(downloadItem.downloadId)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));

      if (parsedBookInfo !== null) {
        trackedDownload.remoteBook = this.parsingService.map(parsedBookInfo);
      }

      const downloadHistory = this.downloadHistoryService.getLatestDownloadHistoryItem(
        downloadItem.downloadId
      );

      if (downloadHistory !== undefined) {
        trackedDownload.state = getStateFromHistory(downloadHistory.eventType);

        if (downloadHistory.eventType === DownloadHistoryEventType.DownloadImportIncomplete) {
          const messages = JSON.parse(
            downloadHistory.data["statusMessages"] ?? "[]"
          ) as TrackedDownloadStatusMessage[];
          warnTrackedDownload(trackedDownload, messages);
        }
      }

      if (historyItems.length > 0) {
        const firstHistoryItem = historyItems[0]!;
        const grabbedEvent = historyItems.find(
          (v) => v.eventType === EntityHistoryEventType.Grabbed
        );

        trackedDownload.indexer = grabbedEvent?.data["indexer"] ?? null;

        if (
          parsedBookInfo === null ||
          trackedDownload.remoteBook?.author == null ||
          trackedDownload.remoteBook.books.length === 0
        ) {
          // Try parsing the original source title and if that fails, try parsing it as a special
          const historyAuthorId = firstHistoryItem.authorId;
          const grabbedBookIds = Array.from(
            new Set(
              historyItems
                .filter((v) => v.eventType === EntityHistoryEventType.Grabbed)
                .map((h) => h.bookId)
            )
          );

          parsedBookInfo = parseBookTitle(firstHistoryItem.sourceTitle);

          if (parsedBookInfo !== null) {
            trackedDownload.remoteBook = this.parsingService.mapByIds(
              parsedBookInfo,
              historyAuthorId,
              grabbedBookIds
            );
          } else {
            // NOTE: the real C# source resolves `historyAuthor`/`historyBooks`
            // from the first history item's populated `.Author`/`.Book`
            // navigation properties (`EntityHistory.Author`/`EntityHistory.Book`
            // -- LazyLoaded joins). This port's `EntityHistoryRecord` forward-ref
            // (entityHistory.ts) only carries the ids (see that file's doc
            // comment on why History isn't ported yet), so
            // `parseBookTitleWithSearchCriteria`'s `Author historyAuthor` /
            // `List<Book> historyBooks` params aren't resolvable from this
            // module's inputs alone -- this branch is therefore skipped
            // (parsedBookInfo stays null, matching the C# fallback of an
            // unparseable title) until History is ported for real, at which
            // point `historyItems` should carry hydrated Author/Book objects.
            void parseBookTitleWithSearchCriteria;
          }
        }

        if (trackedDownload.remoteBook !== null) {
          const flags = tryParseIndexerFlags(grabbedEvent?.data["indexerFlags"]);
          if (flags !== null) {
            const release = trackedDownload.remoteBook.release ?? {
              guid: null,
              title: null,
              size: 0,
              downloadUrl: null,
              infoUrl: null,
              commentUrl: null,
              indexerId: 0,
              indexer: null,
              author: null,
              book: null,
              indexerPriority: 0,
              downloadProtocol: null,
              publishDate: new Date(0).toISOString(),
              origin: null,
              source: null,
              container: null,
              codec: null,
              categories: null,
              languages: [],
              indexerFlags: 0 as IndexerFlags,
              pendingReleaseReason: null,
            };
            trackedDownload.remoteBook = {
              ...trackedDownload.remoteBook,
              release: { ...release, indexerFlags: flags },
            };
          }
        }
      }

      // Calculate custom formats
      if (trackedDownload.remoteBook !== null) {
        this.formatCalculator.parseCustomFormatForRemoteBook(
          trackedDownload.remoteBook,
          downloadItem.totalSize
        );
      }

      // Track it so it can be displayed in the queue even though we can't
      // determine which author it is for (C# logs a trace message here;
      // omitted per this port's no-NLog-yet convention).
    } catch {
      return null;
    }

    this.logItemChange(
      trackedDownload,
      existingItem?.downloadItem ?? null,
      trackedDownload.downloadItem
    );

    this.cache.set(trackedDownload.downloadItem.downloadId, trackedDownload);
    return trackedDownload;
  }

  getTrackedDownloads(): TrackedDownload[] {
    return Array.from(this.cache.values());
  }

  /** Ported from `TrackedDownloadService.UpdateTrackable`: `ExceptBy` on download id. */
  updateTrackable(trackedDownloads: TrackedDownload[]): void {
    const trackableIds = new Set(trackedDownloads.map((t) => t.downloadItem.downloadId));
    const untrackable = this.getTrackedDownloads().filter(
      (t) => !trackableIds.has(t.downloadItem.downloadId)
    );

    for (const trackedDownload of untrackable) {
      trackedDownload.isTrackable = false;
    }
  }

  private logItemChange(
    _trackedDownload: TrackedDownload,
    _existingItem: DownloadClientItem | null,
    _downloadItem: DownloadClientItem
  ): void {
    // C#: _logger.Debug("Tracking '{0}:{1}': ...") -- omitted per this
    // port's no-NLog-yet convention (see class doc comment).
  }

  private updateCachedItem(trackedDownload: TrackedDownload): void {
    const parsedBookInfo = parseBookTitle(trackedDownload.downloadItem.title);
    trackedDownload.remoteBook =
      parsedBookInfo === null ? null : this.parsingService.mapByIds(parsedBookInfo, 0, [0]);
  }

  handleBookInfoRefreshed(message: BookInfoRefreshedEvent): void {
    let needsToUpdate = false;

    for (const book of message.removed) {
      const cachedItems = Array.from(this.cache.values()).filter(
        (t) => t.remoteBook?.books != null && t.remoteBook.books.some((e) => e.id === book.id)
      );

      if (cachedItems.length > 0) {
        needsToUpdate = true;
      }

      cachedItems.forEach((item) => this.updateCachedItem(item));
    }

    if (needsToUpdate) {
      this.eventAggregator.publishEvent(
        new TrackedDownloadRefreshedEvent(this.getTrackedDownloads())
      );
    }
  }

  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    const cachedItems = Array.from(this.cache.values()).filter(
      (t) => t.remoteBook?.author != null && t.remoteBook.author.id === message.author.id
    );

    if (cachedItems.length > 0) {
      cachedItems.forEach((item) => this.updateCachedItem(item));

      this.eventAggregator.publishEvent(
        new TrackedDownloadRefreshedEvent(this.getTrackedDownloads())
      );
    }
  }
}

function getStateFromHistory(eventType: DownloadHistoryEventType): TrackedDownloadState {
  switch (eventType) {
    case DownloadHistoryEventType.DownloadImportIncomplete:
      return TrackedDownloadState.ImportFailed;
    case DownloadHistoryEventType.DownloadImported:
      return TrackedDownloadState.Imported;
    case DownloadHistoryEventType.DownloadFailed:
      return TrackedDownloadState.DownloadFailed;
    case DownloadHistoryEventType.DownloadIgnored:
      return TrackedDownloadState.Ignored;
    default:
      return TrackedDownloadState.Downloading;
  }
}

/** Ported from `Enum.TryParse(grabbedEvent?.Data?.GetValueOrDefault("indexerFlags"), true, out IndexerFlags flags)`: case-insensitive member-name parse, `null` (TryParse-failed) on missing/unparseable input. */
function tryParseIndexerFlags(raw: string | undefined): IndexerFlags | null {
  if (raw === undefined) {
    return null;
  }
  const match = Object.entries(IndexerFlags).find(
    ([key, value]) => typeof value === "number" && key.toLowerCase() === raw.toLowerCase()
  );
  return match ? (match[1] as IndexerFlags) : null;
}

// Referenced for type-shape only (DownloadHistory import keeps the module
// self-documenting re: what getLatestDownloadHistoryItem returns).
export type { DownloadHistory, Book };
