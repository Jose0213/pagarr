import type { AuthorDeletedEvent } from "../books/events.js";
import type { Book } from "../books/models.js";
import type { BookGrabbedEvent } from "../download-tracking/bookGrabbedEvent.js";
import type { BookImportIncompleteEvent } from "../download-tracking/bookImportIncompleteEvent.js";
import type { DownloadFailedEvent, DownloadIgnoredEvent } from "../download-tracking/events.js";
import { isTorrentInfo } from "../decision-engine/remoteBook.js";
import type { TrackImportedEvent } from "../media-files-import/events.js";
import type { BookFile } from "../media-files-import/bookFile.js";
import { DeleteMediaFileReason } from "../media-files-import/deleteMediaFileReason.js";
import type { BookFileDeletedEvent } from "../media-files-import/events.js";
import type { BookFileRetaggedEvent } from "../media-files-tags/audioTagService.js";
import { PagingSpec } from "../db/paging-spec.js";
import { newEntityHistory, EntityHistoryEventType, type EntityHistory } from "./entityHistory.js";
import type { IHistoryRepository } from "./historyRepository.js";

/**
 * Ported from `Book.AuthorId`'s compatibility getter (`Author?.Value?.Id ??
 * 0`) -- same gap/fix as `author-stats/authorStatisticsService.ts`'s
 * `bookAuthorId` helper (see that file's doc comment): `Book` has no stored
 * `AuthorId` column, only the lazy-loaded `Author` navigation property this
 * getter reads. Every `Handle(...)` method below that iterates a
 * `RemoteBook.Books`/`.BookIds` list and reads `book.AuthorId` uses this.
 */
function bookAuthorId(book: Book): number {
  return book.author?.id ?? 0;
}

/**
 * Ported from NzbDrone.Core/History/BookFileRenamedEvent.cs's slice this
 * service reads. `NzbDrone.Core.MediaFiles.Events.BookFileRenamedEvent`
 * isn't ported as a real class anywhere yet -- `media-files-organize/
 * renameBookFileService.ts` (the module that would publish it) uses plain
 * `onBookFileRenamed?: (author, bookFile, previousPath) => void` callbacks
 * instead of a real event class (see that file's doc comment), unlike
 * `media-files-tags/audioTagService.ts`'s sibling `BookFileRetaggedEvent`,
 * which IS a real ported class. This is a genuine forward-ref (not a
 * reused real type) for the one event class in this handler list that
 * truly doesn't exist yet anywhere in the merged codebase.
 */
export interface BookFileRenamedEvent {
  bookFile: BookFile;
  originalPath: string;
}

/**
 * Ported from NzbDrone.Core/History/HistoryService.cs.
 *
 * ## Event/type choices and known gaps (for the reconciliation pass)
 *
 * - `BookGrabbedEvent` (download-tracking/bookGrabbedEvent.ts) carries
 *   DecisionEngine's `RemoteBook`/`ReleaseInfo` (decision-engine/
 *   remoteBook.ts) -- see that event file's own doc comment on why. That
 *   forward-ref `ReleaseInfo` has NO `indexerFlags` field (unlike the real
 *   C# `ReleaseInfo.IndexerFlags`), so `handleBookGrabbed`'s "IndexerFlags"
 *   Data entry is hardcoded to "0" below rather than fabricated -- flagged
 *   explicitly, not silently dropped.
 * - `BookImportIncompleteEvent.trackedDownload.remoteBook` (download-tracking/
 *   tracked-downloads/trackedDownload.ts) is typed with `parser/model/
 *   remoteBook.ts`'s `RemoteBook` -- a THIRD, independent `RemoteBook`/
 *   `ReleaseInfo` forward-ref/real-type pair, distinct from both
 *   DecisionEngine's copy above and Blocklisting's own choice
 *   (blocklisting/blocklistService.ts also uses DecisionEngine's). This
 *   handler uses that module's actual type since that's what the event
 *   really carries.
 * - `TrackImportedEvent`/`BookFileDeletedEvent` are the REAL, already-merged
 *   types from `media-files-import/events.ts` (Phase 3).
 * - `BookFileRetaggedEvent` is the REAL, already-merged class from
 *   `media-files-tags/audioTagService.ts` (Phase 3) -- its `bookFile` field
 *   is `BookFileRef` (media-files-tags/audioTagTypes.ts), which has no
 *   `quality` field (unlike the real `media-files-import/bookFile.ts`
 *   `BookFile`); the C# `Handle(BookFileRetaggedEvent)` reads
 *   `message.BookFile.Quality`, so `handleBookFileRetagged` below takes an
 *   explicit `quality` parameter alongside the event.
 * - `BookFileRenamedEvent` is NOT real anywhere yet -- see this file's own
 *   forward-ref above.
 * - `TrackImportedEvent`/`findDownloadId`'s `bookId`/`authorId` parameters:
 *   this port's real `TrackImportedEvent.trackInfo`/`.importedTrack` are
 *   typed loosely (`TLocalBook = unknown` -- see media-files-import/
 *   events.ts's doc comment on why), so they can't structurally carry
 *   `.book.id`/`.author.id` here; callers pass both explicitly.
 *
 * `IHandle<T>`/`IHandleAsync<T>` subscriptions are ported as individually
 * named `handleXxx` methods, matching the established convention (see
 * `download-tracking/history/downloadHistoryService.ts`'s doc comment).
 */
export interface IHistoryService {
  paged(pagingSpec: PagingSpec<EntityHistory>): PagingSpec<EntityHistory>;
  mostRecentForBook(bookId: number): EntityHistory | undefined;
  mostRecentForDownloadId(downloadId: string): EntityHistory | undefined;
  get(historyId: number): EntityHistory;
  getByAuthor(authorId: number, eventType: EntityHistoryEventType | null): EntityHistory[];
  getByBook(bookId: number, eventType: EntityHistoryEventType | null): EntityHistory[];
  find(downloadId: string, eventType: EntityHistoryEventType): EntityHistory[];
  findByDownloadId(downloadId: string): EntityHistory[];
  findDownloadId(
    trackedDownload: TrackImportedEvent,
    authorId: number,
    bookId: number,
    quality: EntityHistory["quality"]
  ): string | null;
  since(date: string, eventType: EntityHistoryEventType | null): EntityHistory[];
  updateMany(items: EntityHistory[]): void;
}

export interface HistoryServiceLogger {
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: HistoryServiceLogger = { debug: () => {} };

export class HistoryService implements IHistoryService {
  constructor(
    private readonly historyRepository: IHistoryRepository,
    private readonly logger: HistoryServiceLogger = noopLogger
  ) {}

  paged(pagingSpec: PagingSpec<EntityHistory>): PagingSpec<EntityHistory> {
    return this.historyRepository.getPaged(pagingSpec);
  }

  mostRecentForBook(bookId: number): EntityHistory | undefined {
    return this.historyRepository.mostRecentForBook(bookId);
  }

  mostRecentForDownloadId(downloadId: string): EntityHistory | undefined {
    return this.historyRepository.mostRecentForDownloadId(downloadId);
  }

  get(historyId: number): EntityHistory {
    return this.historyRepository.get(historyId);
  }

  getByAuthor(authorId: number, eventType: EntityHistoryEventType | null): EntityHistory[] {
    return this.historyRepository.getByAuthor(authorId, eventType);
  }

  getByBook(bookId: number, eventType: EntityHistoryEventType | null): EntityHistory[] {
    return this.historyRepository.getByBook(bookId, eventType);
  }

  find(downloadId: string, eventType: EntityHistoryEventType): EntityHistory[] {
    return this.historyRepository
      .findByDownloadId(downloadId)
      .filter((c) => c.eventType === eventType);
  }

  findByDownloadId(downloadId: string): EntityHistory[] {
    return this.historyRepository.findByDownloadId(downloadId);
  }

  /**
   * Ported from `FindDownloadId(TrackImportedEvent trackedDownload)`. See
   * this class's doc comment on why `authorId`/`bookId` are explicit
   * parameters here; `quality` (`trackedDownload.ImportedBook.Quality` in
   * the C# source) is likewise explicit for the same reason.
   */
  findDownloadId(
    _trackedDownload: TrackImportedEvent,
    authorId: number,
    bookId: number,
    quality: EntityHistory["quality"]
  ): string | null {
    this.logger.debug("Trying to find downloadId for book {0} from history", bookId);

    const bookIds = [bookId];
    const allHistory = this.historyRepository.findDownloadHistory(authorId, quality);

    const booksHistory = allHistory.filter((h) => bookIds.includes(h.bookId));

    const processedDownloadIds = booksHistory
      .filter((c) => c.eventType !== EntityHistoryEventType.Grabbed && c.downloadId !== null)
      .map((c) => c.downloadId);

    const stillDownloading = booksHistory.filter(
      (c) =>
        c.eventType === EntityHistoryEventType.Grabbed &&
        !processedDownloadIds.includes(c.downloadId)
    );

    let downloadId: string | null = null;

    if (stillDownloading.length > 0) {
      const matchingHistory = stillDownloading.filter((c) => c.bookId === bookId);

      if (matchingHistory.length !== 1) {
        return null;
      }

      const newDownloadId = matchingHistory[0]?.downloadId ?? null;

      if (downloadId === null || downloadId === newDownloadId) {
        downloadId = newDownloadId;
      } else {
        return null;
      }
    }

    return downloadId;
  }

  /** Ported from `Handle(BookGrabbedEvent message)`. */
  handleBookGrabbed(message: BookGrabbedEvent): void {
    for (const book of message.book.books) {
      const history = newEntityHistory({
        eventType: EntityHistoryEventType.Grabbed,
        date: new Date().toISOString(),
        quality: message.book.parsedBookInfo.quality,
        sourceTitle: message.book.release.title,
        authorId: bookAuthorId(book),
        bookId: book.id,
        downloadId: message.downloadId,
      });

      history.data["Indexer"] = message.book.release.indexer;
      history.data["NzbInfoUrl"] = message.book.release.infoUrl;
      history.data["ReleaseGroup"] = message.book.parsedBookInfo.releaseGroup ?? undefined;
      // Ported from `message.Book.Release.Age.ToString()`/`AgeHours`/`AgeMinutes` --
      // computed-property accessors on ReleaseInfo, not stored fields (see
      // decision-engine/remoteBook.ts's ageDays/ageHours/ageMinutes doc comment).
      const publishedMs = new Date(message.book.release.publishDate).getTime();
      history.data["Age"] = String(Math.trunc((Date.now() - publishedMs) / (86400 * 1000)));
      history.data["AgeHours"] = String((Date.now() - publishedMs) / (3600 * 1000));
      history.data["AgeMinutes"] = String((Date.now() - publishedMs) / (60 * 1000));
      history.data["PublishedDate"] = message.book.release.publishDate;
      history.data["DownloadClient"] = message.downloadClient ?? undefined;
      history.data["DownloadClientName"] = message.downloadClientName ?? undefined;
      history.data["Size"] = String(message.book.release.size);
      history.data["DownloadUrl"] = message.book.release.downloadUrl;
      history.data["Guid"] = message.book.release.guid;
      history.data["Protocol"] = String(message.book.release.downloadProtocol);
      history.data["DownloadForced"] = String(!message.book.downloadAllowed);
      history.data["CustomFormatScore"] = String(message.book.customFormatScore);
      history.data["ReleaseSource"] = String(message.book.releaseSource);
      // GAP: real C# reads `message.Book.Release.IndexerFlags.ToString()`.
      // DecisionEngine's forward-ref `ReleaseInfo` (this event's `release`
      // type) has no `indexerFlags` field -- see class doc comment. Hardcoded
      // to "0" (IndexerFlags' zero/no-flags value) rather than fabricated.
      history.data["IndexerFlags"] = "0";

      if (
        message.book.parsedBookInfo.releaseHash &&
        message.book.parsedBookInfo.releaseHash.trim() !== ""
      ) {
        history.data["ReleaseHash"] = message.book.parsedBookInfo.releaseHash;
      }

      if (isTorrentInfo(message.book.release)) {
        history.data["TorrentInfoHash"] = message.book.release.infoHash ?? undefined;
      }

      this.historyRepository.insert(history);
    }
  }

  /** Ported from `Handle(BookImportIncompleteEvent message)`. `trackedDownload.remoteBook` is `parser/model/remoteBook.ts`'s real `RemoteBook` (see class doc comment) -- its `parsedBookInfo`/`author` are nullable, matching the C# `?.` chains this ports directly. */
  handleBookImportIncomplete(message: BookImportIncompleteEvent): void {
    const remoteBook = message.trackedDownload.remoteBook;
    if (remoteBook === null) {
      return;
    }

    for (const book of remoteBook.books) {
      const history = newEntityHistory({
        eventType: EntityHistoryEventType.BookImportIncomplete,
        date: new Date().toISOString(),
        quality: remoteBook.parsedBookInfo?.quality ?? undefined,
        sourceTitle: message.trackedDownload.downloadItem.title,
        authorId: bookAuthorId(book),
        bookId: book.id,
        downloadId: message.trackedDownload.downloadItem.downloadId,
      });

      history.data["StatusMessages"] = JSON.stringify(message.trackedDownload.statusMessages);
      history.data["ReleaseGroup"] = remoteBook.parsedBookInfo?.releaseGroup ?? undefined;
      history.data["IndexerFlags"] = remoteBook.release ? "0" : undefined;

      this.historyRepository.insert(history);
    }
  }

  /**
   * Ported from `Handle(TrackImportedEvent message)`. See class doc comment
   * on why `authorId`/`bookId` are explicit parameters.
   */
  handleTrackImported(message: TrackImportedEvent, authorId: number, bookId: number): void {
    if (!message.newDownload) {
      return;
    }

    let downloadId = message.downloadClientItem
      ? (message.downloadClientItem as { downloadId?: string | null }).downloadId
      : null;

    if (!downloadId || downloadId.trim() === "") {
      downloadId = this.findDownloadId(message, authorId, bookId, message.importedTrack.quality);
    }

    const history = newEntityHistory({
      eventType: EntityHistoryEventType.BookFileImported,
      date: new Date().toISOString(),
      quality: message.importedTrack.quality,
      sourceTitle:
        message.importedTrack.sceneName ?? fileNameWithoutExtension(message.importedTrack.path),
      authorId,
      bookId,
      downloadId: downloadId ?? null,
    });

    history.data["FileId"] = String(message.importedTrack.id);
    history.data["DroppedPath"] = message.importedTrack.path;
    history.data["ImportedPath"] = message.importedTrack.path;
    history.data["ReleaseGroup"] = message.importedTrack.releaseGroup ?? undefined;
    history.data["Size"] = String(message.importedTrack.size);
    history.data["IndexerFlags"] = String(message.importedTrack.indexerFlags);

    this.historyRepository.insert(history);
  }

  /** Ported from `Handle(DownloadFailedEvent message)`. */
  handleDownloadFailed(message: DownloadFailedEvent): void {
    for (const bookId of message.bookIds) {
      const history = newEntityHistory({
        eventType: EntityHistoryEventType.DownloadFailed,
        date: new Date().toISOString(),
        quality: message.quality ?? undefined,
        sourceTitle: message.sourceTitle,
        authorId: message.authorId,
        bookId,
        downloadId: message.downloadId,
      });

      history.data["DownloadClient"] = message.downloadClient ?? undefined;
      history.data["DownloadClientName"] =
        message.trackedDownload?.downloadItem.downloadClientInfo?.name ?? undefined;
      history.data["Message"] = message.message ?? undefined;
      history.data["ReleaseGroup"] =
        message.trackedDownload?.remoteBook?.parsedBookInfo?.releaseGroup ??
        message.data["releaseGroup"];
      history.data["Size"] = message.trackedDownload
        ? String(message.trackedDownload.downloadItem.totalSize)
        : message.data["size"];
      history.data["Indexer"] =
        message.trackedDownload?.remoteBook?.release?.indexer ?? message.data["indexer"];

      this.historyRepository.insert(history);
    }
  }

  /** Ported from `Handle(BookFileDeletedEvent message)`. */
  handleBookFileDeleted(message: BookFileDeletedEvent): void {
    if (message.reason === DeleteMediaFileReason.NoLinkedEpisodes) {
      this.logger.debug(
        "Removing book file from DB as part of cleanup routine, not creating history event."
      );
      return;
    } else if (message.reason === DeleteMediaFileReason.ManualOverride) {
      this.logger.debug(
        "Removing book file from DB as part of manual override of existing file, not creating history event."
      );
      return;
    }

    const history = newEntityHistory({
      eventType: EntityHistoryEventType.BookFileDeleted,
      date: new Date().toISOString(),
      quality: message.bookFile.quality,
      sourceTitle: message.bookFile.path,
      authorId: message.bookFile.author?.id ?? 0,
      bookId: message.bookFile.edition?.bookId ?? 0,
    });

    history.data["Reason"] = message.reason;
    history.data["ReleaseGroup"] = message.bookFile.releaseGroup ?? undefined;
    history.data["IndexerFlags"] = String(message.bookFile.indexerFlags);

    this.historyRepository.insert(history);
  }

  /** Ported from `Handle(BookFileRenamedEvent message)`. See class doc comment on why this event is a genuine local forward-ref. */
  handleBookFileRenamed(message: BookFileRenamedEvent): void {
    const sourcePath = message.originalPath;
    const path = message.bookFile.path;

    const history = newEntityHistory({
      eventType: EntityHistoryEventType.BookFileRenamed,
      date: new Date().toISOString(),
      quality: message.bookFile.quality,
      sourceTitle: message.originalPath,
      authorId: message.bookFile.author?.id ?? 0,
      bookId: message.bookFile.edition?.bookId ?? 0,
    });

    history.data["SourcePath"] = sourcePath;
    history.data["Path"] = path;
    history.data["ReleaseGroup"] = message.bookFile.releaseGroup ?? undefined;
    history.data["Size"] = String(message.bookFile.size);
    history.data["IndexerFlags"] = String(message.bookFile.indexerFlags);

    this.historyRepository.insert(history);
  }

  /**
   * Ported from `Handle(BookFileRetaggedEvent message)`. See class doc
   * comment on why `quality` is an explicit parameter: the real, already-
   * merged `BookFileRetaggedEvent.bookFile` (`BookFileRef` from
   * media-files-tags/audioTagTypes.ts) has no `quality` field.
   */
  handleBookFileRetagged(message: BookFileRetaggedEvent, quality: EntityHistory["quality"]): void {
    const path = message.bookFile.path;

    const history = newEntityHistory({
      eventType: EntityHistoryEventType.BookFileRetagged,
      date: new Date().toISOString(),
      quality,
      sourceTitle: path,
      authorId: message.bookFile.author?.id ?? message.author.id,
      bookId: message.bookFile.edition?.bookId ?? 0,
    });

    history.data["TagsScrubbed"] = String(message.scrubbed);
    history.data["Diff"] = JSON.stringify(
      Object.entries(message.diff).map(([field, [oldValue, newValue]]) => ({
        Field: field,
        OldValue: oldValue,
        NewValue: newValue,
      }))
    );

    this.historyRepository.insert(history);
  }

  /** Ported from `Handle(AuthorDeletedEvent message)`. */
  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    this.historyRepository.deleteForAuthor(message.author.id);
  }

  /** Ported from `Handle(DownloadIgnoredEvent message)`. */
  handleDownloadIgnored(message: DownloadIgnoredEvent): void {
    const historyToAdd: EntityHistory[] = [];

    for (const bookId of message.bookIds) {
      const history = newEntityHistory({
        eventType: EntityHistoryEventType.DownloadIgnored,
        date: new Date().toISOString(),
        quality: message.quality ?? undefined,
        sourceTitle: message.sourceTitle,
        authorId: message.authorId,
        bookId,
        downloadId: message.downloadId,
      });

      history.data["DownloadClient"] = message.downloadClientInfo?.name ?? undefined;
      history.data["Message"] = message.message ?? undefined;
      history.data["ReleaseGroup"] =
        message.trackedDownload?.remoteBook?.parsedBookInfo?.releaseGroup ?? undefined;
      history.data["Size"] = message.trackedDownload
        ? String(message.trackedDownload.downloadItem.totalSize)
        : undefined;
      history.data["Indexer"] = message.trackedDownload?.remoteBook?.release?.indexer ?? undefined;

      historyToAdd.push(history);
    }

    this.historyRepository.insertMany(historyToAdd);
  }

  since(date: string, eventType: EntityHistoryEventType | null): EntityHistory[] {
    return this.historyRepository.since(date, eventType);
  }

  updateMany(items: EntityHistory[]): void {
    this.historyRepository.updateMany(items);
  }
}

/** Ported from `System.IO.Path.GetFileNameWithoutExtension`. Same helper as media-files-import/bookFile.ts's private one, duplicated locally per this port's per-module self-containment convention (see that file's own copy). */
function fileNameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.substring(0, dotIndex) : base;
}
