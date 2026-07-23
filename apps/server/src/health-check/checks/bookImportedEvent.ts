import type { Author, Book } from "../../books/index.js";
import type { BookFile } from "../../media-files-import/bookFile.js";

/**
 * FORWARD-REFERENCE: ported from NzbDrone.Core/MediaFiles/Events/BookImportedEvent.cs.
 *
 * This is a REAL C# event class (confirmed by reading the source directly --
 * do not confuse with a hypothetical/nonexistent type), published from
 * `ImportApprovedBooks.cs` (in `media-files-import`'s scope) and consumed by
 * two of this module's own checks (`ImportListRootFolderCheck`,
 * `RecyclingBinCheck`, both `[CheckOn(typeof(BookImportedEvent),
 * CheckOnCondition.FailedOnly)]`). `media-files-import/bookImport/
 * importApprovedBooks.ts`'s own doc comment already documents this exact
 * gap ("BookImportedEvent isn't among [the events books/events.ts ported]...
 * Left as a documented gap") -- it was not ported by that module's prior
 * phase. Rather than leave the two HealthCheck checks that depend on it
 * silently missing this event entirely, this module defines the same plain
 * data-class shape locally (matching this port's established
 * events-as-plain-data-classes convention -- see `books/events.ts`'s doc
 * comment) using the real, already-ported `Author`/`Book`/`BookFile` model
 * types. This is NOT a substitute/redesign -- once `media-files-import`
 * publishes a real `BookImportedEvent` through the real `EventAggregator`,
 * that publication should use (or this file's definition should be moved
 * to, and re-exported from) this exact shape; nothing about the two
 * consuming checks needs to change, since `EventAggregator` dispatches by
 * constructor identity (see `messaging/events/eventAggregator.ts`'s "Event
 * identity" doc comment) -- as long as the eventually-real publisher uses
 * the class defined here (or a class this file re-exports), the checks'
 * `checkOn(BookImportedEvent, ...)` registrations already wired below will
 * pick it up with no further changes.
 */
export class BookImportedEvent {
  readonly author: Author;
  readonly book: Book;
  readonly importedBooks: BookFile[];
  readonly oldFiles: BookFile[];
  readonly newDownload: boolean;
  readonly downloadId: string | null;

  constructor(
    author: Author,
    book: Book,
    importedBooks: BookFile[],
    oldFiles: BookFile[],
    newDownload: boolean,
    downloadId: string | null = null
  ) {
    this.author = author;
    this.book = book;
    this.importedBooks = importedBooks;
    this.oldFiles = oldFiles;
    this.newDownload = newDownload;
    this.downloadId = downloadId;
  }
}
