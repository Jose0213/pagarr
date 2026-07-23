import type {
  AuthorAddedEvent,
  AuthorDeletedEvent,
  AuthorUpdatedEvent,
  BookAddedEvent,
  BookDeletedEvent,
  BookEditedEvent,
  BookUpdatedEvent,
} from "../books/events.js";
import type { Book } from "../books/models.js";
import type { BookFileDeletedEvent } from "../media-files-import/events.js";
import type { AuthorStatistics } from "./authorStatistics.js";
import { newAuthorStatistics } from "./authorStatistics.js";
import type { BookStatistics } from "./bookStatistics.js";
import type { IAuthorStatisticsRepository } from "./authorStatisticsRepository.js";

/**
 * Ported from `Book.AuthorId`'s compatibility getter (`Author?.Value?.Id ??
 * 0`) -- `Book` has no stored `AuthorId` column (only `AuthorMetadataId`);
 * the real C# property reads the lazy-loaded `Author` navigation property
 * and defaults to 0 if it isn't populated. `books/models.ts`'s ported
 * `Book` keeps `author` as the same caller-populated optional field per
 * that file's LazyLoaded convention, so this mirrors the C# getter exactly
 * rather than assuming an `authorId` field that doesn't exist on the port's
 * `Book` type.
 */
function bookAuthorId(book: Book): number {
  return book.author?.id ?? 0;
}

/**
 * Ported from NzbDrone.Core/AuthorStats/AuthorStatisticsService.cs.
 *
 * ## `ICacheManager.GetCache<List<BookStatistics>>(GetType())` -> plain `Map`
 *
 * Same "replace ICacheManager/ICached with a plain Map" convention as
 * `jobs/TaskManager.ts` (see that file's doc comment) -- C#'s
 * `_cache.Get(key, () => ...)` (get-or-compute-and-store) becomes
 * `getOrCompute` below.
 *
 * ## `[EventHandleOrder(EventHandleOrder.First)]` on every handler
 *
 * Every one of this service's C# `Handle(...)` methods is marked
 * `[EventHandleOrder(EventHandleOrder.First)]` -- ensuring the stats cache is
 * invalidated before any other subscriber (e.g. a SignalR broadcaster) reads
 * stale cached values for the same event. Ported as individually-named
 * `handleXxx` methods (this module's real C# source implements NINE
 * different `IHandle<T>` interfaces on one class -- C# does this via
 * interface-method overloading, which TS's single `handle()` name per
 * `IHandle<T>` can't replicate on one class the same way; matches the
 * established convention in `download-tracking/history/downloadHistoryService.ts`'s
 * doc comment). A caller wiring up the real `EventAggregator` registers each
 * `handleXxx` with `EventHandleOrder.First` explicitly at subscription time.
 */
export interface IAuthorStatisticsService {
  authorStatistics(): AuthorStatistics[];
  authorStatisticsByAuthor(authorId: number): AuthorStatistics;
}

export class AuthorStatisticsService implements IAuthorStatisticsService {
  private readonly cache = new Map<string, BookStatistics[]>();

  constructor(private readonly repository: IAuthorStatisticsRepository) {}

  private getOrCompute(key: string, compute: () => BookStatistics[]): BookStatistics[] {
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const value = compute();
    this.cache.set(key, value);
    return value;
  }

  authorStatistics(): AuthorStatistics[] {
    const bookStatistics = this.getOrCompute("AllAuthors", () =>
      this.repository.authorStatistics()
    );

    const byAuthor = new Map<number, BookStatistics[]>();
    for (const stat of bookStatistics) {
      const list = byAuthor.get(stat.authorId) ?? [];
      list.push(stat);
      byAuthor.set(stat.authorId, list);
    }

    return [...byAuthor.values()].map((stats) => this.mapAuthorStatistics(stats));
  }

  authorStatisticsByAuthor(authorId: number): AuthorStatistics {
    const stats = this.getOrCompute(authorId.toString(), () =>
      this.repository.authorStatisticsByAuthor(authorId)
    );

    if (!stats || stats.length === 0) {
      return newAuthorStatistics();
    }

    return this.mapAuthorStatistics(stats);
  }

  private mapAuthorStatistics(bookStatistics: BookStatistics[]): AuthorStatistics {
    const first = bookStatistics[0];
    if (!first) {
      throw new Error("Sequence contains no elements");
    }

    return {
      authorId: first.authorId,
      bookFileCount: bookStatistics.reduce((sum, s) => sum + s.bookFileCount, 0),
      bookCount: bookStatistics.reduce((sum, s) => sum + s.bookCount, 0),
      availableBookCount: bookStatistics.reduce((sum, s) => sum + s.availableBookCount, 0),
      totalBookCount: bookStatistics.reduce((sum, s) => sum + s.totalBookCount, 0),
      sizeOnDisk: bookStatistics.reduce((sum, s) => sum + s.sizeOnDisk, 0),
      bookStatistics,
    };
  }

  /** Ported from `Handle(AuthorAddedEvent message)`. */
  handleAuthorAdded(message: AuthorAddedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(message.author.id.toString());
  }

  /** Ported from `Handle(AuthorUpdatedEvent message)`. */
  handleAuthorUpdated(message: AuthorUpdatedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(message.author.id.toString());
  }

  /** Ported from `Handle(AuthorDeletedEvent message)`. */
  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(message.author.id.toString());
  }

  /** Ported from `Handle(BookAddedEvent message)`. */
  handleBookAdded(message: BookAddedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(bookAuthorId(message.book).toString());
  }

  /** Ported from `Handle(BookDeletedEvent message)`. */
  handleBookDeleted(message: BookDeletedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(bookAuthorId(message.book).toString());
  }

  /**
   * Ported from `Handle(BookImportedEvent message)`.
   * `NzbDrone.Core.MediaFiles.Events.BookImportedEvent` isn't ported in any
   * merged module yet (distinct from the real, ported `TrackImportedEvent`
   * in media-files-import/events.ts) -- exposed as a plain method a future
   * caller invokes with the author id directly, matching this module's
   * "define the seam, wire the real bus later" precedent for not-yet-ported
   * event types (see `jobs/TaskManager.ts`'s doc comment for the identical
   * shape on `Handle(ApplicationStartedEvent)`).
   */
  handleBookImported(authorId: number): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(authorId.toString());
  }

  /** Ported from `Handle(BookEditedEvent message)`. */
  handleBookEdited(message: BookEditedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(bookAuthorId(message.book).toString());
  }

  /** Ported from `Handle(BookUpdatedEvent message)`. */
  handleBookUpdated(message: BookUpdatedEvent): void {
    this.cache.delete("AllAuthors");
    this.cache.delete(bookAuthorId(message.book).toString());
  }

  /**
   * Ported from `Handle(BookFileDeletedEvent message)`. `message.BookFile.
   * Author?.Value?.Id` (C#'s `LazyLoaded<Author>` null-conditional chain) is
   * ported as a nullable `bookFile.author?.id` read matching this port's
   * established LazyLoaded-as-plain-optional-field convention (see
   * `books/models.ts`'s header comment) -- only removes the per-author cache
   * entry when an author is actually populated on the file, same as the C#
   * `if (authorId != null)` guard.
   */
  handleBookFileDeleted(message: BookFileDeletedEvent): void {
    this.cache.delete("AllAuthors");

    const authorId = message.bookFile.author?.id;
    if (authorId != null) {
      this.cache.delete(authorId.toString());
    }
  }
}
