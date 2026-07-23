/**
 * Ported from NzbDrone.Core/Books/Services/BookMonitoredService.cs.
 *
 * Deviation: no NLog `Logger` (see monitorNewBookService.ts's doc comment
 * for why).
 */

import type { AuthorService } from "./authorService.js";
import type { BookService } from "./bookService.js";
import { MonitorTypes, type Author, type Book, type MonitoringOptions } from "./models.js";

export class BookMonitoredService {
  constructor(
    private readonly authorService: AuthorService,
    private readonly bookService: BookService
  ) {}

  /**
   * Ported from BookMonitoredService.SetBookMonitoredStatus(Author author,
   * MonitoringOptions monitoringOptions). Faithfully preserves the C#
   * control flow: if specific `booksToMonitor` foreign ids are given, they
   * take priority over `monitor` entirely; otherwise `monitor` decides via
   * the switch below. Books are updated individually (not in bulk) "to
   * ensure updates are sent to frontend", matching the C# comment.
   */
  setBookMonitoredStatus(author: Author, monitoringOptions: MonitoringOptions | null): void {
    if (monitoringOptions) {
      const books = this.bookService.getBooksByAuthor(author.id);
      const booksWithFiles = this.bookService.getAuthorBooksWithFiles(author);
      const booksWithFileIds = new Set(booksWithFiles.map((b) => b.id));

      const now = new Date().toISOString();
      const booksWithoutFiles = books.filter(
        (b) => !booksWithFileIds.has(b.id) && (b.releaseDate ?? "") <= now
      );

      const monitoredBooks = monitoringOptions.booksToMonitor;

      if (monitoredBooks.length > 0) {
        this.toggleBooksMonitoredState(
          books.filter((b) => monitoredBooks.includes(b.foreignBookId)),
          true
        );
        this.toggleBooksMonitoredState(
          books.filter((b) => !monitoredBooks.includes(b.foreignBookId)),
          false
        );
      } else {
        switch (monitoringOptions.monitor) {
          case MonitorTypes.All:
            this.toggleBooksMonitoredState(books, true);
            break;
          case MonitorTypes.Future:
            this.toggleBooksMonitoredState(
              books.filter((b) => booksWithFileIds.has(b.id)),
              false
            );
            this.toggleBooksMonitoredState(
              books.filter((b) => booksWithoutFiles.some((w) => w.id === b.id)),
              false
            );
            break;
          case MonitorTypes.None:
            this.toggleBooksMonitoredState(books, false);
            break;
          case MonitorTypes.Missing:
            this.toggleBooksMonitoredState(
              books.filter((b) => booksWithFileIds.has(b.id)),
              false
            );
            this.toggleBooksMonitoredState(
              books.filter((b) => booksWithoutFiles.some((w) => w.id === b.id)),
              true
            );
            break;
          case MonitorTypes.Existing:
            this.toggleBooksMonitoredState(
              books.filter((b) => booksWithFileIds.has(b.id)),
              true
            );
            this.toggleBooksMonitoredState(
              books.filter((b) => booksWithoutFiles.some((w) => w.id === b.id)),
              false
            );
            break;
          case MonitorTypes.Latest: {
            this.toggleBooksMonitoredState(books, false);
            const latest = latestByReleaseDate(books);
            if (latest) {
              this.toggleBooksMonitoredState([latest], true);
            }
            break;
          }
          case MonitorTypes.First: {
            this.toggleBooksMonitoredState(books, false);
            const first = earliestByReleaseDate(books);
            if (first) {
              this.toggleBooksMonitoredState([first], true);
            }
            break;
          }
          default:
            throw new Error(`Unhandled MonitorTypes value: ${String(monitoringOptions.monitor)}`);
        }
      }

      for (const book of books) {
        this.bookService.updateBook(book);
      }
    }

    this.authorService.updateAuthor(author);
  }

  /** Ported from BookMonitoredService.ToggleBooksMonitoredState(IEnumerable<Book> books, bool monitored): mutates in place, matching the C# (books array elements are shared references with the outer `books` list). */
  private toggleBooksMonitoredState(books: Book[], monitored: boolean): void {
    for (const book of books) {
      book.monitored = monitored;
    }
  }
}

function latestByReleaseDate(books: Book[]): Book | undefined {
  return [...books].sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""))[0];
}

function earliestByReleaseDate(books: Book[]): Book | undefined {
  return [...books].sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""))[0];
}
