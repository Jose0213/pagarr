import type { Author, Book } from "../books/models.js";
import type { BookFile } from "../media-files-import/bookFile.js";
import { DeleteMediaFileReason } from "../media-files-import/deleteMediaFileReason.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import type { RenamedBookFile } from "../media-files-organize/renamedBookFile.js";
import type { INotificationFactory } from "./NotificationFactory.js";
import type { NotificationDefinition } from "./NotificationDefinition.js";
import type { INotificationStatusService } from "./NotificationStatusService.js";
import type { ApplicationUpdateMessage } from "./ApplicationUpdateMessage.js";
import { createAuthorDeleteMessage } from "./AuthorDeleteMessage.js";
import { createBookDeleteMessage } from "./BookDeleteMessage.js";
import type { BookDownloadMessage } from "./BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "./BookFileDeleteMessage.js";
import type { BookRetagMessage } from "./BookRetagMessage.js";
import type { DownloadFailedMessage } from "./DownloadFailedMessage.js";
import type { GrabMessage } from "./GrabMessage.js";
import {
  HealthCheckResult,
  type BookFileRetaggedEventLike,
  type DeleteCompletedEventLike,
  type HealthCheckFailedEventLike,
  type UpdateInstalledEventLike,
} from "./forwardRefs.js";

/** Minimal logger surface NotificationService needs. */
export interface NotificationServiceLogger {
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: NotificationServiceLogger = {
  debug: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Ported inputs for `NotificationService.Handle(BookGrabbedEvent)`. Field
 * names/types mirror `NzbDrone.Core/Download/BookGrabbedEvent.cs`
 * (`Book.Author`, `Book.Books`, `Book.ParsedBookInfo.Quality`,
 * `DownloadClientName`, `DownloadClient`, `DownloadId`) closely enough that
 * a caller holding the real `download-tracking/bookGrabbedEvent.ts`
 * `BookGrabbedEvent` (whose `book` field is DecisionEngine's `RemoteBook`,
 * not this module's own `GrabMessage.remoteBook` -- see `GrabMessage.ts`'s
 * doc comment on that divergence) can adapt one into this shape with a
 * plain object literal -- no class inheritance/casting required, matching
 * this port's "narrow input DTO, not the whole upstream event" convention
 * used throughout (see e.g. `books/events.ts` for the same idea applied to
 * publishing rather than consuming).
 */
export interface BookGrabbedInput {
  book: {
    author: Author;
    books: Book[];
    parsedBookInfo: { quality: QualityModel };
  };
  downloadClientName: string | null;
  downloadClient: string | null;
  downloadId: string | null;
}

/** Ported input shape for `NotificationService.Handle(BookImportedEvent)`. */
export interface BookImportedInput {
  newDownload: boolean;
  author: Author;
  book: Book;
  downloadClientInfo: BookDownloadMessage["downloadClientInfo"];
  downloadId: string | null;
  importedBooks: BookFile[];
  oldFiles: BookFile[];
}

/** Ported input shape for `NotificationService.Handle(AuthorRenamedEvent)`. */
export interface AuthorRenamedInput {
  author: Author;
  renamedFiles: RenamedBookFile[];
}

/** Ported input shape for `NotificationService.Handle(AuthorAddedEvent)`. */
export interface AuthorAddedInput {
  author: Author;
}

/** Ported input shape for `NotificationService.Handle(AuthorDeletedEvent)`. `authorName` is the caller-resolved `author.metadata?.name` -- see `AuthorDeleteMessage.ts`'s doc comment. */
export interface AuthorDeletedInput {
  author: Author;
  authorName: string;
  deleteFiles: boolean;
}

/** Ported input shape for `NotificationService.Handle(BookDeletedEvent)`. */
export interface BookDeletedInput {
  book: Book;
  deleteFiles: boolean;
}

/** Ported input shape for `NotificationService.Handle(BookFileDeletedEvent)`. */
export interface BookFileDeletedInput {
  bookFile: BookFile;
  reason: DeleteMediaFileReason;
}

/** Ported input shape for `NotificationService.Handle(DownloadFailedEvent)`. */
export interface DownloadFailedInput {
  downloadId: string | null;
  downloadClient: string | null;
  quality: QualityModel | null;
  sourceTitle: string;
  message: string;
  trackedDownloadAuthor: Author;
}

/** Ported input shape for `NotificationService.Handle(BookImportIncompleteEvent)`. */
export interface BookImportIncompleteInput {
  sourceTitle: string;
  trackedDownloadAuthor: Author;
}

/**
 * Ported from NzbDrone.Core/Notifications/NotificationService.cs.
 *
 * ## Event-source divergence (see this module's final report)
 *
 * The real C# `NotificationService` implements `IHandle<TEvent>` for 11
 * distinct domain events (`BookGrabbedEvent`, `BookImportedEvent`,
 * `AuthorRenamedEvent`, `AuthorAddedEvent`, `AuthorDeletedEvent`,
 * `BookDeletedEvent`, `BookFileDeletedEvent`, `HealthCheckFailedEvent`,
 * `DownloadFailedEvent`, `BookImportIncompleteEvent`,
 * `BookFileRetaggedEvent`) plus `IHandleAsync<DeleteCompletedEvent>` and
 * `IHandle<UpdateInstalledEvent>`. A full-tree search of this repo (done
 * before writing this file -- see this module's final report) found these
 * source events in wildly different states of portedness: some are real,
 * canonical ports (`AuthorAddedEvent`/`AuthorDeletedEvent`/
 * `BookDeletedEvent` in `books/events.ts`, `BookImportIncompleteEvent` in
 * `download-tracking/bookImportIncompleteEvent.ts`); some exist as TWO
 * divergent declarations across sibling modules with different field sets
 * (`BookFileDeletedEvent`, `BookImportedEvent`'s closest analog
 * `TrackImportedEvent`); `AuthorRenamedEvent` exists only as a private
 * forward-ref inside `extras/forwardRefs.ts`; and `HealthCheckFailedEvent`/
 * `BookFileRetaggedEvent`/`DeleteCompletedEvent`/`UpdateInstalledEvent` don't
 * exist anywhere at all (no HealthCheck or Update-history module has been
 * ported in this repo yet).
 *
 * Given that fragmentation, this class does NOT subscribe itself to any of
 * those concrete upstream event classes directly (doing so would mean
 * hard-coupling this module to whichever sibling worktree's divergent
 * `BookFileDeletedEvent`/`BookFile`/`DeleteMediaFileReason` declaration
 * happens to be imported, which is exactly the kind of cross-module drift
 * this repo's merge-review process exists to catch and reconcile). Instead,
 * each `handleX()` method below takes a narrow, faithfully-shaped INPUT
 * interface (declared just above this class) matching only the fields the
 * real C# `Handle(TEvent)` body actually reads off its event parameter --
 * the same "define the narrow shape you actually need" discipline
 * `download-tracking/mediaFilesEvents.ts`'s `BookFileLike`/`LocalBookLike`
 * already established for the identical problem. A caller (wherever this
 * service is wired up, once a canonical event bus / canonical event types
 * exist) adapts whichever concrete event class it's holding into that
 * shape with a plain object literal.
 *
 * `IHandle<T>`/`IHandleAsync<T>` themselves (the REAL `messaging/`
 * interfaces) are still used as this class's outward contract: it
 * implements them against its own local marker types built from the input
 * interfaces above, so a real `IEventAggregator.subscribe()` call can wire
 * this service up mechanically once a caller settles on canonical event
 * classes for each of these 11 event kinds -- see `handlers` getter below.
 */
export class NotificationService {
  constructor(
    private readonly notificationFactory: INotificationFactory,
    private readonly notificationStatusService: INotificationStatusService,
    private readonly logger: NotificationServiceLogger = noopLogger
  ) {}

  /** Ported from `NotificationService.GetMessage(Author, List<Book>, QualityModel)`. */
  private getMessage(author: Author, books: Book[], quality: QualityModel): string {
    let qualityString = quality.quality.name;

    if (quality.revision.version > 1) {
      qualityString += " Proper";
    }

    const bookTitles = books.map((b) => b.title).join(" + ");

    return `${author.metadata?.name ?? ""} - ${bookTitles} - [${qualityString}]`;
  }

  /** Ported from `NotificationService.GetBookDownloadMessage(Author, Book, List<BookFile>)`. */
  private getBookDownloadMessage(author: Author, book: Book, tracks: BookFile[]): string {
    return `${author.metadata?.name ?? ""} - ${book.title} (${tracks.length} Files Imported)`;
  }

  /** Ported from `NotificationService.GetBookIncompleteImportMessage(string)`. */
  private getBookIncompleteImportMessage(source: string): string {
    return `Readarr failed to Import all files for ${source}`;
  }

  /** Ported from `NotificationService.FormatMissing(object)`. */
  private formatMissing(value: string | null | undefined): string {
    const text = value?.toString();
    return !text || text.trim() === "" ? "<missing>" : text;
  }

  /** Ported from `NotificationService.GetTrackRetagMessage(Author, BookFile, Dictionary<...>)`. */
  private getTrackRetagMessage(bookFile: BookFile, diff: Record<string, [string, string]>): string {
    const lines = Object.entries(diff).map(
      ([key, [oldValue, newValue]]) =>
        `${key}: ${this.formatMissing(oldValue)} → ${this.formatMissing(newValue)}`
    );
    return `${bookFile.path}:\n${lines.join("\n")}`;
  }

  /** Ported from `NotificationService.ShouldHandleAuthor(ProviderDefinition, Author)`. */
  private shouldHandleAuthor(definition: NotificationDefinition, author: Author): boolean {
    if (definition.tags.length === 0) {
      this.logger.debug("No tags set for this notification.");
      return true;
    }

    if (definition.tags.some((t) => author.tags.includes(t))) {
      this.logger.debug("Notification and author have one or more intersecting tags.");
      return true;
    }

    // TODO: this message could be more clear (preserved verbatim from the C# source comment).
    this.logger.debug(
      "%s does not have any intersecting tags with %s. Notification will not be sent.",
      definition.name,
      author.metadata?.name ?? ""
    );
    return false;
  }

  /** Ported from `NotificationService.ShouldHandleHealthFailure(HealthCheck, bool)`. */
  private shouldHandleHealthFailure(
    healthCheck: HealthCheckFailedEventLike["healthCheck"],
    includeWarnings: boolean
  ): boolean {
    if (healthCheck.type === HealthCheckResult.Error) {
      return true;
    }

    if (healthCheck.type === HealthCheckResult.Warning && includeWarnings) {
      return true;
    }

    return false;
  }

  /** Ported from `NotificationService.Handle(BookGrabbedEvent message)`. */
  async handleGrab(message: BookGrabbedInput): Promise<void> {
    const grabMessage: GrabMessage = {
      message: this.getMessage(
        message.book.author,
        message.book.books,
        message.book.parsedBookInfo.quality
      ),
      author: message.book.author,
      quality: message.book.parsedBookInfo.quality,
      remoteBook: null,
      downloadClientName: message.downloadClientName,
      downloadClientType: message.downloadClient,
      downloadId: message.downloadId,
    };

    for (const notification of this.notificationFactory.onGrabEnabled()) {
      try {
        if (!this.shouldHandleAuthor(notification.definition, message.book.author)) {
          continue;
        }

        await notification.onGrab(grabMessage);
        this.notificationStatusService.recordSuccess(notification.definition.id);
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.error(
          "Unable to send OnGrab notification to %s",
          notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(BookImportedEvent message)`. */
  async handleBookImported(message: BookImportedInput): Promise<void> {
    if (!message.newDownload) {
      return;
    }

    const downloadMessage: BookDownloadMessage = {
      message: this.getBookDownloadMessage(message.author, message.book, message.importedBooks),
      author: message.author,
      book: message.book,
      downloadClientInfo: message.downloadClientInfo,
      downloadId: message.downloadId,
      bookFiles: message.importedBooks,
      oldFiles: message.oldFiles,
    };

    for (const notification of this.notificationFactory.onReleaseImportEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, message.author)) {
          if (message.oldFiles.length === 0 || notification.definition.onUpgrade) {
            await notification.onReleaseImport(downloadMessage);
            this.notificationStatusService.recordSuccess(notification.definition.id);
          }
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnReleaseImport notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(AuthorRenamedEvent message)`. */
  async handleAuthorRenamed(message: AuthorRenamedInput): Promise<void> {
    for (const notification of this.notificationFactory.onRenameEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, message.author)) {
          await notification.onRename(message.author, message.renamedFiles);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnRename notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(AuthorAddedEvent message)`. */
  async handleAuthorAdded(message: AuthorAddedInput): Promise<void> {
    for (const notification of this.notificationFactory.onAuthorAddedEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, message.author)) {
          await notification.onAuthorAdded(message.author);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnAuthorAdded notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(AuthorDeletedEvent message)`. */
  async handleAuthorDeleted(message: AuthorDeletedInput): Promise<void> {
    const deleteMessage = createAuthorDeleteMessage(
      message.author,
      message.authorName,
      message.deleteFiles
    );

    for (const notification of this.notificationFactory.onAuthorDeleteEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, deleteMessage.author)) {
          await notification.onAuthorDelete(deleteMessage);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnAuthorDelete notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(BookDeletedEvent message)`. */
  async handleBookDeleted(message: BookDeletedInput): Promise<void> {
    const deleteMessage = createBookDeleteMessage(message.book, message.deleteFiles);

    for (const notification of this.notificationFactory.onBookDeleteEnabled()) {
      try {
        if (
          deleteMessage.book.author &&
          this.shouldHandleAuthor(notification.definition, deleteMessage.book.author)
        ) {
          await notification.onBookDelete(deleteMessage);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnBookDelete notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(BookFileDeletedEvent message)`. */
  async handleBookFileDeleted(message: BookFileDeletedInput): Promise<void> {
    const author = message.bookFile.author;
    const book = message.bookFile.edition?.book ?? null;

    const deleteMessage: BookFileDeleteMessage = {
      message: author && book ? this.getMessage(author, [book], message.bookFile.quality) : "",
      bookFile: message.bookFile,
      book,
      reason: message.reason,
    };

    for (const notification of this.notificationFactory.onBookFileDeleteEnabled()) {
      try {
        if (
          message.reason !== DeleteMediaFileReason.Upgrade ||
          notification.definition.onBookFileDeleteForUpgrade
        ) {
          if (author && this.shouldHandleAuthor(notification.definition, author)) {
            await notification.onBookFileDelete(deleteMessage);
            this.notificationStatusService.recordSuccess(notification.definition.id);
          }
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnBookFileDelete notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /**
   * Ported from `NotificationService.Handle(HealthCheckFailedEvent message)`.
   * `message.HealthCheck`/`IsInStartupGracePeriod` typed against this
   * module's local `HealthCheckFailedEventLike` forward-ref -- see
   * `forwardRefs.ts`'s doc comment (no HealthCheck module ported anywhere
   * in this repo yet).
   */
  async handleHealthCheckFailed(message: HealthCheckFailedEventLike): Promise<void> {
    // Don't send health check notifications during the start up grace period,
    // once that duration expires they'll be retested and fired off if necessary.
    if (message.isInStartupGracePeriod) {
      return;
    }

    for (const notification of this.notificationFactory.onHealthIssueEnabled()) {
      try {
        if (
          this.shouldHandleHealthFailure(
            message.healthCheck,
            notification.definition.includeHealthWarnings
          )
        ) {
          await notification.onHealthIssue(message.healthCheck);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnHealthIssue notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(DownloadFailedEvent message)`. */
  async handleDownloadFailed(message: DownloadFailedInput): Promise<void> {
    const downloadFailedMessage: DownloadFailedMessage = {
      downloadId: message.downloadId,
      downloadClient: message.downloadClient,
      quality: message.quality,
      sourceTitle: message.sourceTitle,
      message: message.message,
    };

    for (const notification of this.notificationFactory.onDownloadFailureEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, message.trackedDownloadAuthor)) {
          await notification.onDownloadFailure(downloadFailedMessage);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnDownloadFailure notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(BookImportIncompleteEvent message)`. */
  async handleBookImportIncomplete(message: BookImportIncompleteInput): Promise<void> {
    // TODO: Build out this message so that we can pass on what failed and what was successful (preserved verbatim from the C# source comment).
    const downloadMessage: BookDownloadMessage = {
      message: this.getBookIncompleteImportMessage(message.sourceTitle),
      author: null,
      book: null,
      bookFiles: null,
      oldFiles: null,
      downloadClientInfo: null,
      downloadId: null,
    };

    for (const notification of this.notificationFactory.onImportFailureEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, message.trackedDownloadAuthor)) {
          await notification.onImportFailure(downloadMessage);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnImportFailure notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(BookFileRetaggedEvent message)`. */
  async handleBookFileRetagged(message: BookFileRetaggedEventLike): Promise<void> {
    const book = message.bookFile.edition?.book ?? null;

    const retagMessage: BookRetagMessage = {
      message: this.getTrackRetagMessage(message.bookFile, message.diff),
      author: message.author,
      book,
      bookFile: message.bookFile,
      diff: message.diff,
      scrubbed: message.scrubbed,
    };

    for (const notification of this.notificationFactory.onBookRetagEnabled()) {
      try {
        if (this.shouldHandleAuthor(notification.definition, message.author)) {
          await notification.onBookRetag(retagMessage);
          this.notificationStatusService.recordSuccess(notification.definition.id);
        }
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnBookRetag notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.Handle(UpdateInstalledEvent message)`. */
  async handleApplicationUpdate(message: UpdateInstalledEventLike): Promise<void> {
    const updateMessage: ApplicationUpdateMessage = {
      message: `Readarr updated from ${message.previousVersion} to ${message.newVersion}`,
      previousVersion: message.previousVersion,
      newVersion: message.newVersion,
    };

    for (const notification of this.notificationFactory.onApplicationUpdateEnabled()) {
      try {
        await notification.onApplicationUpdate(updateMessage);
        this.notificationStatusService.recordSuccess(notification.definition.id);
      } catch (ex) {
        this.notificationStatusService.recordFailure(notification.definition.id);
        this.logger.warn(
          "Unable to send OnApplicationUpdate notification to: " + notification.definition.name,
          ex
        );
      }
    }
  }

  /** Ported from `NotificationService.HandleAsync(DeleteCompletedEvent message)`. */
  async handleDeleteCompleted(_message: DeleteCompletedEventLike): Promise<void> {
    await this.processQueue();
  }

  /** Ported from `NotificationService.ProcessQueue()`. */
  private async processQueue(): Promise<void> {
    for (const notification of this.notificationFactory.getAvailableProviders()) {
      try {
        await notification.processQueue();
      } catch (ex) {
        this.logger.warn(
          "Unable to process notification queue for " + notification.definition.name,
          ex
        );
      }
    }
  }
}
