/**
 * Ported from NzbDrone.Core/Books/Events/*.cs.
 *
 * C#'s events implemented the Messaging module's `IEvent` marker interface
 * and were dispatched through `IEventAggregator.PublishEvent` (constructor
 * injected). The Messaging module itself is Phase 4 (not yet ported) --
 * this repo's Phase 0 `db/events.ts` already ported the narrower
 * `IEventAggregator`/`ModelEvent` shape that `BasicRepository` needs (see
 * that file's doc comment), which is a different, smaller event concept
 * (row-level Created/Updated/Deleted) than these domain events
 * (AuthorAddedEvent, BookDeletedEvent, etc).
 *
 * These Books domain events are ported as plain data classes (mirroring
 * the C# constructor-sets-readonly-properties shape) plus a
 * `IBooksEventAggregator` publish contract narrowed to just what this
 * module needs, with a no-op default -- following the exact pattern
 * `db/events.ts` established for `IEventAggregator`/`NullEventAggregator`.
 * Once the real Messaging module lands, a real aggregator implementing
 * this interface can be swapped in without any Books call site changing,
 * same as that file's note says for BasicRepository.
 *
 * The Handlers/ and Commands/ subdirectories that *consume* these events in
 * C# (AuthorAddedHandler, BookAddedHandler, AuthorEditedService, plus
 * RefreshAuthorCommand/BulkRefreshAuthorCommand/etc.) are not ported here:
 * they exist purely to push refresh work onto `IManageCommandQueue`, a
 * Messaging-module (Phase 4) concept with no ported equivalent yet. See
 * this module's final report for the full list of what's deferred and why.
 */

import type { Author, Book, Edition } from "./models.js";

export class AuthorAddedEvent {
  constructor(
    public readonly author: Author,
    public readonly doRefresh = true
  ) {}
}

export class AuthorDeletedEvent {
  constructor(
    public readonly author: Author,
    public readonly deleteFiles: boolean,
    public readonly addImportListExclusion: boolean
  ) {}
}

export class AuthorEditedEvent {
  constructor(
    public readonly author: Author,
    public readonly oldAuthor: Author
  ) {}
}

export class AuthorMovedEvent {
  constructor(
    public readonly author: Author,
    public readonly sourcePath: string,
    public readonly destinationPath: string
  ) {}
}

export class AuthorRefreshCompleteEvent {
  constructor(public readonly author: Author) {}
}

export class AuthorUpdatedEvent {
  constructor(public readonly author: Author) {}
}

export class AuthorsImportedEvent {
  constructor(
    public readonly authorIds: number[],
    public readonly doRefresh = true
  ) {}
}

export class BookAddedEvent {
  constructor(
    public readonly book: Book,
    public readonly doRefresh = true
  ) {}
}

export class BookDeletedEvent {
  constructor(
    public readonly book: Book,
    public readonly deleteFiles: boolean,
    public readonly addImportListExclusion: boolean
  ) {}
}

export class BookEditedEvent {
  constructor(
    public readonly book: Book,
    public readonly oldBook: Book
  ) {}
}

export class BookInfoRefreshedEvent {
  constructor(
    public readonly author: Author,
    public readonly added: readonly Book[],
    public readonly updated: readonly Book[],
    public readonly removed: readonly Book[]
  ) {}
}

export class BookUpdatedEvent {
  constructor(public readonly book: Book) {}
}

export class EditionDeletedEvent {
  constructor(public readonly edition: Edition) {}
}

export type BooksDomainEvent =
  | AuthorAddedEvent
  | AuthorDeletedEvent
  | AuthorEditedEvent
  | AuthorMovedEvent
  | AuthorRefreshCompleteEvent
  | AuthorUpdatedEvent
  | AuthorsImportedEvent
  | BookAddedEvent
  | BookDeletedEvent
  | BookEditedEvent
  | BookInfoRefreshedEvent
  | BookUpdatedEvent
  | EditionDeletedEvent;

/** Ported narrowing of db/events.ts's IEventAggregator to this module's domain event union. */
export interface IBooksEventAggregator {
  publishEvent(event: BooksDomainEvent): void;
}

/** No-op aggregator, same role as db/events.ts's NullEventAggregator: usable until Messaging (Phase 4) lands. */
export class NullBooksEventAggregator implements IBooksEventAggregator {
  publishEvent(): void {
    // Intentional no-op.
  }
}
