/**
 * Ported from NzbDrone.Core/Books/Services/BookService.cs.
 *
 * ## Deviations
 *
 * - `ITextMatcher` (textMatching.ts) stands in for the Parser-module
 *   extension methods `BookScoringFunctions` uses (`FuzzyMatch`,
 *   `FuzzyContains`, `RemoveBracketsAndContents`, `RemoveAfterDash`,
 *   `SplitBookTitle`, `CleanAuthorName`) -- see that file's module doc
 *   comment.
 * - `findByTitle`/`bookRepository.findByTitle` take a pre-cleaned title
 *   (via the injected matcher) rather than importing `Parser.CleanAuthorName`
 *   directly -- see bookRepository.ts's `findByTitle` doc comment.
 * - `IHandle<AuthorDeletedEvent>` (C#'s auto-wired Messaging subscription)
 *   is ported as a plain `handleAuthorDeleted` method -- see
 *   seriesBookLinkService.ts's module doc comment for why, and the same
 *   caller-invokes-explicitly note applies here.
 * - No NLog `Logger` (see monitorNewBookService.ts's doc comment for why).
 */

import type { BookRepository } from "./bookRepository.js";
import type { EditionService } from "./editionService.js";
import {
  AuthorDeletedEvent,
  BookAddedEvent,
  BookDeletedEvent,
  BookEditedEvent,
  type IBooksEventAggregator,
} from "./events.js";
import { PagingSpec } from "../db/paging-spec.js";
import { findByStringInexact, type ITextMatcher } from "./textMatching.js";
import type { Author, Book } from "./models.js";

export class BookService {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly editionService: EditionService,
    private readonly eventAggregator: IBooksEventAggregator,
    private readonly textMatcher: ITextMatcher
  ) {}

  /**
   * Ported from BookService.AddBook(Book newBook, bool doRefresh = true).
   * Throws if AuthorMetadataId is 0 (can't insert an orphan book), upserts
   * the book row, then inserts any brand-new editions (id === 0) and marks
   * exactly one of them monitored via EditionService.SetMonitored --
   * preferring the caller's already-monitored edition, falling back to the
   * first edition if none is monitored yet.
   */
  addBook(newBook: Book, doRefresh = true): Book {
    if (newBook.authorMetadataId === 0) {
      throw new Error("Cannot insert book with AuthorMetadataId = 0");
    }

    const upserted = this.bookRepository.upsert(newBook);

    const editions = (newBook.editions ?? []).map((e) => ({ ...e, bookId: upserted.id }));

    // insertMany returns the inserted rows with their generated ids -- the
    // local `editions` array must be updated in place with those ids
    // (matching C#'s `editions.ForEach(x => x.BookId = newBook.Id);
    // _editionService.InsertMany(...)`, where InsertMany mutates each
    // Edition's Id in place via Dapper; TS has no equivalent mutate-in-place
    // insert, so the ids are reconciled by array position here instead).
    const newEditionIndexes = editions.reduce<number[]>((acc, e, i) => {
      if (e.id === 0) {
        acc.push(i);
      }
      return acc;
    }, []);

    if (newEditionIndexes.length > 0) {
      const inserted = this.editionService.insertMany(editions.filter((e) => e.id === 0));
      newEditionIndexes.forEach((editionIndex, i) => {
        editions[editionIndex] = inserted[i]!;
      });
    }

    const editionToMonitor = editions.find((e) => e.monitored) ?? editions[0];
    if (editionToMonitor) {
      this.editionService.setMonitored(editionToMonitor);
    }

    this.eventAggregator.publishEvent(new BookAddedEvent(this.getBook(upserted.id), doRefresh));

    return upserted;
  }

  /** Ported from BookService.DeleteBook(int bookId, bool deleteFiles, bool addImportListExclusion = false). */
  deleteBook(bookId: number, deleteFiles: boolean, addImportListExclusion = false): void {
    const book = this.bookRepository.get(bookId);
    this.bookRepository.delete(bookId);
    this.eventAggregator.publishEvent(new BookDeletedEvent(book, deleteFiles, addImportListExclusion));
  }

  findById(foreignId: string): Book | undefined {
    return this.bookRepository.findById(foreignId);
  }

  findBySlug(titleSlug: string): Book | undefined {
    return this.bookRepository.findBySlug(titleSlug);
  }

  /** Ported from BookService.FindByTitle(int authorMetadataId, string title): delegates straight to the repository, no title cleaning here (that's done inside the repository call in C#). */
  findByTitle(authorMetadataId: number, title: string): Book | undefined {
    let cleanTitle = this.textMatcher.cleanAuthorName(title);
    if (cleanTitle === "") {
      cleanTitle = title;
    }
    return this.bookRepository.findByTitle(authorMetadataId, title, cleanTitle);
  }

  /** Ported from BookService.BookScoringFunctions(string title, string cleanTitle). */
  private bookScoringFunctions(authorName: string, title: string): Array<(book: Book) => number> {
    const cleanTitle = this.textMatcher.cleanAuthorName(title);
    const cleanBracketDash = this.textMatcher.cleanAuthorName(
      this.textMatcher.removeAfterDash(this.textMatcher.removeBracketsAndContents(title))
    );
    const cleanDash = this.textMatcher.cleanAuthorName(this.textMatcher.removeAfterDash(title));
    const cleanBrackets = this.textMatcher.cleanAuthorName(this.textMatcher.removeBracketsAndContents(title));

    return [
      (b) => this.textMatcher.fuzzyMatch(b.cleanTitle, cleanTitle),
      (b) => this.textMatcher.fuzzyMatch(b.title, title),
      (b) => this.textMatcher.fuzzyMatch(b.cleanTitle, cleanBrackets),
      (b) => this.textMatcher.fuzzyMatch(b.cleanTitle, cleanDash),
      (b) => this.textMatcher.fuzzyMatch(b.cleanTitle, cleanBracketDash),
      (b) => this.textMatcher.fuzzyContains(cleanTitle, b.cleanTitle),
      (b) => this.textMatcher.fuzzyContains(title, b.title),
      (b) => this.textMatcher.fuzzyMatch(this.textMatcher.splitBookTitle(b.title, authorName)[0], title),
    ];
  }

  /**
   * Ported from BookService.FindByTitleInexact(int authorMetadataId,
   * string title). Deviation: the C# scoring functions read
   * `a.AuthorMetadata.Value.Name` directly off each candidate book (via
   * its lazy-loaded relation); since Book.authorMetadata may not be
   * populated on every row here (see models.ts's module doc comment on
   * dropping LazyLoaded), callers pass the author's name explicitly.
   */
  findByTitleInexact(authorMetadataId: number, title: string, authorName = ""): Book | undefined {
    const books = this.getBooksByAuthorMetadataId(authorMetadataId);

    for (const scoreFn of this.bookScoringFunctions(authorName, title)) {
      const results = findByStringInexact(books, scoreFn, 0.7, 0.4);
      if (results.length === 1) {
        return results[0];
      }
    }

    return undefined;
  }

  /** Ported from BookService.GetCandidates(int authorMetadataId, string title). */
  getCandidates(authorMetadataId: number, title: string, authorName = ""): Book[] {
    const books = this.getBooksByAuthorMetadataId(authorMetadataId);
    const output: Book[] = [];

    for (const scoreFn of this.bookScoringFunctions(authorName, title)) {
      output.push(...findByStringInexact(books, scoreFn, 0.7, 0.4));
    }

    return distinctById(output);
  }

  getAllBooks(): Book[] {
    return this.bookRepository.all();
  }

  getBook(bookId: number): Book {
    return this.bookRepository.get(bookId);
  }

  getBooks(bookIds: number[]): Book[] {
    return this.bookRepository.getMany(bookIds);
  }

  getBooksByAuthor(authorId: number): Book[] {
    return this.bookRepository.getBooks(authorId);
  }

  getNextBooksByAuthorMetadataId(authorMetadataIds: number[]): Book[] {
    return this.bookRepository.getNextBooks(authorMetadataIds);
  }

  getLastBooksByAuthorMetadataId(authorMetadataIds: number[]): Book[] {
    return this.bookRepository.getLastBooks(authorMetadataIds);
  }

  getBooksByAuthorMetadataId(authorMetadataId: number): Book[] {
    return this.bookRepository.getBooksByAuthorMetadataId(authorMetadataId);
  }

  getBooksForRefresh(authorMetadataId: number, foreignIds: string[]): Book[] {
    return this.bookRepository.getBooksForRefresh(authorMetadataId, foreignIds);
  }

  getBooksByFileIds(fileIds: number[]): Book[] {
    return this.bookRepository.getBooksByFileIds(fileIds);
  }

  /** Ported from BookService.SetAddOptions(IEnumerable<Book> books): `SetFields(books.ToList(), s => s.AddOptions)`. */
  setAddOptions(books: Book[]): void {
    for (const book of books) {
      this.bookRepository.setFields(book, ["addOptions"]);
    }
  }

  booksWithoutFiles(pagingSpec: PagingSpec<Book>): PagingSpec<Book> {
    return this.bookRepository.booksWithoutFiles(pagingSpec);
  }

  booksBetweenDates(start: string, end: string, includeUnmonitored: boolean): Book[] {
    return this.bookRepository.booksBetweenDates(start, end, includeUnmonitored);
  }

  authorBooksBetweenDates(author: Author, start: string, end: string, includeUnmonitored: boolean): Book[] {
    return this.bookRepository.authorBooksBetweenDates(author, start, end, includeUnmonitored);
  }

  getAuthorBooksWithFiles(author: Author): Book[] {
    return this.bookRepository.getAuthorBooksWithFiles(author);
  }

  /** Ported from BookService.InsertMany(List<Book> books): throws if any book has AuthorMetadataId == 0. */
  insertMany(books: Book[]): void {
    if (books.some((b) => b.authorMetadataId === 0)) {
      throw new Error("Cannot insert book with AuthorMetadataId = 0");
    }
    this.bookRepository.insertMany(books);
  }

  updateMany(books: Book[]): void {
    this.bookRepository.updateMany(books);
  }

  /** Ported from BookService.DeleteMany(List<Book> books): deletes then publishes one BookDeletedEvent per book. */
  deleteMany(books: Book[]): void {
    this.bookRepository.deleteMany(books);

    for (const book of books) {
      this.eventAggregator.publishEvent(new BookDeletedEvent(book, false, false));
    }
  }

  /** Ported from BookService.UpdateBook(Book book). */
  updateBook(book: Book): Book {
    const storedBook = this.getBook(book.id);
    const updatedBook = this.bookRepository.update(book);

    this.eventAggregator.publishEvent(new BookEditedEvent(updatedBook, storedBook));

    return updatedBook;
  }

  /** Ported from BookService.SetBookMonitored(int bookId, bool monitored): also fires a BookEditedEvent(book, book) so author stats update. */
  setBookMonitored(bookId: number, monitored: boolean): void {
    const book = this.bookRepository.get(bookId);
    this.bookRepository.setMonitoredFlat(book, monitored);

    this.eventAggregator.publishEvent(new BookEditedEvent(book, book));
  }

  /** Ported from BookService.SetMonitored(IEnumerable<int> ids, bool monitored). */
  setMonitored(ids: number[], monitored: boolean): void {
    this.bookRepository.setMonitored(ids, monitored);

    for (const book of this.bookRepository.getMany(ids)) {
      this.eventAggregator.publishEvent(new BookEditedEvent(book, book));
    }
  }

  /** Ported from BookService.UpdateLastSearchTime(List<Book> books): `SetFields(books, b => b.LastSearchTime)`. */
  updateLastSearchTime(books: Book[]): void {
    for (const book of books) {
      this.bookRepository.setFields(book, ["lastSearchTime"]);
    }
  }

  /** Ported from BookService.Handle(AuthorDeletedEvent message). */
  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    const books = this.getBooksByAuthorMetadataId(message.author.authorMetadataId);
    this.deleteMany(books);
  }
}

function distinctById(books: Book[]): Book[] {
  const seen = new Set<number>();
  const result: Book[] = [];
  for (const b of books) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      result.push(b);
    }
  }
  return result;
}
