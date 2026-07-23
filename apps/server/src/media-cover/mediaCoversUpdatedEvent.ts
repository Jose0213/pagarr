import type { IEvent } from "../messaging/index.js";
import type { Author, Book } from "../books/index.js";

/**
 * Ported from NzbDrone.Core/MediaCover/MediaCoversUpdatedEvent.cs.
 *
 * C#: two constructor overloads, `MediaCoversUpdatedEvent(Author author)`
 * and `MediaCoversUpdatedEvent(Book book)`, each setting only their own
 * property (`Author`/`Book`) and leaving the other null. Ported as two
 * static factory functions (`forAuthor`/`forBook`) rather than TS
 * constructor overloads on a single positional parameter (which can't
 * distinguish "an Author was passed" from "a Book was passed" the way C#'s
 * overload resolution does by static type) -- both produce the same
 * `{ author, book }` shape the C# instance would have (one populated, one
 * null), so `event.author`/`event.book` reads work identically to the C#
 * source at every existing call site (`mediaCoverService.ts`'s
 * `handleAsync(AuthorRefreshCompleteEvent)` only ever needs the
 * author-populated form -- see that file -- so `forBook` exists for shape
 * fidelity with the C# source even though nothing in this module's ported
 * surface constructs it yet).
 */
export class MediaCoversUpdatedEvent implements IEvent {
  readonly author: Author | null;
  readonly book: Book | null;

  private constructor(author: Author | null, book: Book | null) {
    this.author = author;
    this.book = book;
  }

  /** Ported from `MediaCoversUpdatedEvent(Author author)`. */
  static forAuthor(author: Author): MediaCoversUpdatedEvent {
    return new MediaCoversUpdatedEvent(author, null);
  }

  /** Ported from `MediaCoversUpdatedEvent(Book book)`. */
  static forBook(book: Book): MediaCoversUpdatedEvent {
    return new MediaCoversUpdatedEvent(null, book);
  }
}
