import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { BookRepository } from "../bookRepository.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import { EditionRepository } from "../editionRepository.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { PagingSpec, SortDirection } from "../../db/paging-spec.js";
import {
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  type Author,
  type Book,
} from "../models.js";

describe("BookRepository", () => {
  let db: MainDatabase;
  let bookRepo: BookRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let editionRepo: EditionRepository;

  beforeEach(() => {
    db = createTestDatabase();
    bookRepo = new BookRepository(db);
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    editionRepo = new EditionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function insertAuthor(foreignAuthorId = "fa-1"): Author {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId,
      titleSlug: `slug-${foreignAuthorId}`,
      name: `Author ${foreignAuthorId}`,
    });
    return authorRepo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: `author${foreignAuthorId}`,
      path: `/books/${foreignAuthorId}`,
      monitored: true,
    });
  }

  function insertBook(authorMetadataId: number, overrides: Partial<Book> = {}): Book {
    return bookRepo.insert({
      ...newBook(),
      authorMetadataId,
      foreignBookId: overrides.foreignBookId ?? `fb-${Math.random()}`,
      titleSlug: overrides.titleSlug ?? `title-${Math.random()}`,
      title: overrides.title ?? "A Book",
      cleanTitle: overrides.cleanTitle ?? "abook",
      monitored: overrides.monitored ?? true,
      ...overrides,
    });
  }

  it("inserts and retrieves a book round-trip, including RelatedBooks and LastSearchTime", () => {
    const author = insertAuthor();
    const inserted = insertBook(author.authorMetadataId, {
      relatedBooks: [1, 2, 3],
      lastSearchTime: "2026-01-01T00:00:00.000Z",
    });

    const fetched = bookRepo.get(inserted.id);
    expect(fetched.relatedBooks).toEqual([1, 2, 3]);
    expect(fetched.lastSearchTime).toBe("2026-01-01T00:00:00.000Z");
  });

  it("getBooks returns books for a given Author.Id (joined via AuthorMetadataId)", () => {
    const author = insertAuthor("fa-1");
    const otherAuthor = insertAuthor("fa-2");
    insertBook(author.authorMetadataId, { title: "Book A" });
    insertBook(otherAuthor.authorMetadataId, { title: "Book B" });

    const books = bookRepo.getBooks(author.id);
    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("Book A");
  });

  describe("getLastBooks / getNextBooks", () => {
    // Ported from NzbDrone.Core.Test's BookRepositoryFixture
    // (get_next_books_should_return_next_book /
    // get_last_books_should_return_next_book): insertion order matters --
    // the C# fixture inserts [+1 day, +2 day, -1 day (most recent past),
    // -2 day (older past)], in that exact order, because GetLastBooks'
    // join (`MIN(Id) as id, MAX(ReleaseDate) as date ... ON ids.id =
    // Books.Id AND ids.date = Books.ReleaseDate`) only identifies a row
    // when the filtered group's lowest-Id row is ALSO its
    // latest-ReleaseDate row -- true here because the -1-day book was
    // inserted (and so got its Id) before the -2-day book. See
    // bookRepository.ts's getLastBooks/getNextBooks doc comments.
    it("returns the soonest-upcoming future book (GetNextBooks) and the most-recently-released past book (GetLastBooks)", () => {
      const author = insertAuthor();
      const now = Date.now();
      const plusDays = (n: number) => new Date(now + n * 86_400_000).toISOString();

      insertBook(author.authorMetadataId, { title: "NextFuture", releaseDate: plusDays(1) });
      insertBook(author.authorMetadataId, { title: "LaterFuture", releaseDate: plusDays(2) });
      const mostRecentPast = insertBook(author.authorMetadataId, {
        title: "MostRecentPast",
        releaseDate: plusDays(-1),
      });
      insertBook(author.authorMetadataId, { title: "OlderPast", releaseDate: plusDays(-2) });

      const next = bookRepo.getNextBooks([author.authorMetadataId]);
      expect(next.map((b) => b.title)).toEqual(["NextFuture"]);

      const last = bookRepo.getLastBooks([author.authorMetadataId]);
      expect(last.map((b) => b.id)).toEqual([mostRecentPast.id]);
      expect(last.map((b) => b.title)).toEqual(["MostRecentPast"]);
    });

    it("returns an empty array for an empty id list", () => {
      expect(bookRepo.getLastBooks([])).toEqual([]);
      expect(bookRepo.getNextBooks([])).toEqual([]);
    });
  });

  it("getBooksByAuthorMetadataId filters by AuthorMetadataId", () => {
    const author = insertAuthor();
    insertBook(author.authorMetadataId);
    insertBook(author.authorMetadataId);

    expect(bookRepo.getBooksByAuthorMetadataId(author.authorMetadataId)).toHaveLength(2);
    expect(bookRepo.getBooksByAuthorMetadataId(999999)).toHaveLength(0);
  });

  describe("getBooksForRefresh", () => {
    it("matches by AuthorMetadataId OR any of the given ForeignBookIds", () => {
      const author = insertAuthor();
      const otherAuthor = insertAuthor("fa-other");
      insertBook(author.authorMetadataId, { foreignBookId: "fb-1" });
      const foreignBook = insertBook(otherAuthor.authorMetadataId, { foreignBookId: "fb-2" });

      const results = bookRepo.getBooksForRefresh(author.authorMetadataId, ["fb-2"]);
      expect(results.map((b) => b.id).sort()).toEqual(
        [
          ...bookRepo.getBooksByAuthorMetadataId(author.authorMetadataId).map((b) => b.id),
          foreignBook.id,
        ].sort()
      );
    });

    it("with an empty foreignIds list, matches only by AuthorMetadataId", () => {
      const author = insertAuthor();
      insertBook(author.authorMetadataId);

      expect(bookRepo.getBooksForRefresh(author.authorMetadataId, [])).toHaveLength(1);
    });
  });

  it("findById / findBySlug find a single book", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId, {
      foreignBookId: "fb-unique",
      titleSlug: "slug-unique",
    });

    expect(bookRepo.findById("fb-unique")?.id).toBe(book.id);
    expect(bookRepo.findById("missing")).toBeUndefined();
    expect(bookRepo.findBySlug("slug-unique")?.id).toBe(book.id);
    expect(bookRepo.findBySlug("missing")).toBeUndefined();
  });

  describe("findByTitle", () => {
    it("matches by CleanTitle or Title, scoped to AuthorMetadataId, ExclusiveOrDefault semantics", () => {
      const author = insertAuthor();
      insertBook(author.authorMetadataId, { title: "The Hobbit", cleanTitle: "thehobbit" });

      expect(bookRepo.findByTitle(author.authorMetadataId, "The Hobbit", "thehobbit")?.title).toBe(
        "The Hobbit"
      );
      expect(bookRepo.findByTitle(author.authorMetadataId, "Nope", "nope")).toBeUndefined();
    });

    it("returns undefined when more than one book matches", () => {
      const author = insertAuthor();
      insertBook(author.authorMetadataId, {
        title: "Dupe",
        cleanTitle: "dupe",
        foreignBookId: "fb-d1",
        titleSlug: "d1",
      });
      insertBook(author.authorMetadataId, {
        title: "Dupe",
        cleanTitle: "dupe",
        foreignBookId: "fb-d2",
        titleSlug: "d2",
      });

      expect(bookRepo.findByTitle(author.authorMetadataId, "Dupe", "dupe")).toBeUndefined();
    });
  });

  describe("booksWithoutFiles", () => {
    it("returns only books whose monitored edition has no BookFile and whose release date has passed", () => {
      const author = insertAuthor();
      const past = insertBook(author.authorMetadataId, {
        title: "Past",
        releaseDate: "2000-01-01T00:00:00.000Z",
      });
      const future = insertBook(author.authorMetadataId, {
        title: "Future",
        releaseDate: "2099-01-01T00:00:00.000Z",
      });

      editionRepo.insert({
        ...newEdition(),
        bookId: past.id,
        foreignEditionId: "fe-past",
        titleSlug: "fe-past-slug",
        title: "Past Edition",
        monitored: true,
      });
      editionRepo.insert({
        ...newEdition(),
        bookId: future.id,
        foreignEditionId: "fe-future",
        titleSlug: "fe-future-slug",
        title: "Future Edition",
        monitored: true,
      });

      const spec = new PagingSpec<Book>();
      spec.page = 1;
      spec.pageSize = 10;
      spec.sortKey = "id";
      spec.sortDirection = SortDirection.Ascending;

      const result = bookRepo.booksWithoutFiles(spec);
      expect(result.records.map((b) => b.title)).toEqual(["Past"]);
      expect(result.totalRecords).toBe(1);
    });
  });

  describe("booksBetweenDates / authorBooksBetweenDates", () => {
    it("filters by release date range, and by monitored status when includeUnmonitored is false", () => {
      const author = insertAuthor();
      insertBook(author.authorMetadataId, {
        title: "InRange",
        releaseDate: "2020-06-01T00:00:00.000Z",
        monitored: true,
      });
      insertBook(author.authorMetadataId, {
        title: "OutOfRange",
        releaseDate: "2010-06-01T00:00:00.000Z",
        monitored: true,
      });
      insertBook(author.authorMetadataId, {
        title: "Unmonitored",
        releaseDate: "2020-07-01T00:00:00.000Z",
        monitored: false,
      });

      const start = "2020-01-01T00:00:00.000Z";
      const end = "2020-12-31T00:00:00.000Z";

      const includeAll = bookRepo.booksBetweenDates(start, end, true);
      expect(includeAll.map((b) => b.title).sort()).toEqual(["InRange", "Unmonitored"]);

      const onlyMonitored = bookRepo.booksBetweenDates(start, end, false);
      expect(onlyMonitored.map((b) => b.title)).toEqual(["InRange"]);

      const authorScoped = bookRepo.authorBooksBetweenDates(author, start, end, false);
      expect(authorScoped.map((b) => b.title)).toEqual(["InRange"]);
    });
  });

  describe("setMonitoredFlat / setMonitored", () => {
    it("setMonitoredFlat updates only the Monitored column of the given book", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId, { monitored: false });

      bookRepo.setMonitoredFlat(book, true);

      expect(bookRepo.get(book.id).monitored).toBe(true);
    });

    it("setMonitored bulk-updates the Monitored column for a list of ids", () => {
      const author = insertAuthor();
      const a = insertBook(author.authorMetadataId, { monitored: false });
      const b = insertBook(author.authorMetadataId, { monitored: false });

      bookRepo.setMonitored([a.id, b.id], true);

      expect(bookRepo.get(a.id).monitored).toBe(true);
      expect(bookRepo.get(b.id).monitored).toBe(true);
    });

    it("setMonitored is a no-op for an empty id list", () => {
      expect(() => bookRepo.setMonitored([], true)).not.toThrow();
    });
  });

  describe("getBooksByFileIds / getAuthorBooksWithFiles", () => {
    it("joins through Editions -> BookFiles", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      const edition = editionRepo.insert({
        ...newEdition(),
        bookId: book.id,
        foreignEditionId: "fe-1",
        titleSlug: "fe-1-slug",
        title: "Edition 1",
        monitored: true,
      });

      const conn = db.openConnection();
      const fileResult = conn
        .prepare(
          'INSERT INTO "BookFiles" ("EditionId", "CalibreId", "Quality", "Size", "DateAdded", "Path") VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(edition.id, 1, "{}", 1024, new Date().toISOString(), "/books/file.epub");

      const fileId = Number(fileResult.lastInsertRowid);

      expect(bookRepo.getBooksByFileIds([fileId]).map((b) => b.id)).toEqual([book.id]);
      expect(bookRepo.getBooksByFileIds([])).toEqual([]);

      expect(bookRepo.getAuthorBooksWithFiles(author).map((b) => b.id)).toEqual([book.id]);
    });
  });

  /**
   * Regression coverage for the upsert() double-serialization bugfix (see
   * this class's own `upsert()` doc comment): `BasicRepository.upsert()`
   * calls `this.insert(model)`/`this.update(model)` internally, which via
   * JS virtual dispatch re-enters THIS class's own overrides -- if
   * `upsert()` itself also pre-serializes before delegating to the base
   * class's `upsert()`, the model gets serialized twice, corrupting every
   * JSON-embedded column's stored value. No test previously exercised
   * `upsert()` directly (only `insert()`/`update()` separately), which is
   * how the bug went unnoticed.
   */
  describe("upsert", () => {
    it("insert-branch (id 0): stores JSON-embedded columns single-encoded, not double-encoded", () => {
      const author = insertAuthor();

      const upserted = bookRepo.upsert({
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        foreignBookId: "fb-upsert-insert",
        titleSlug: "t-upsert-insert",
        title: "Upserted Book",
        cleanTitle: "upsertedbook",
        genres: ["Fantasy", "Adventure"],
      });

      expect(upserted.id).toBeGreaterThan(0);
      expect(upserted.genres).toEqual(["Fantasy", "Adventure"]);

      // Raw column inspection: a correctly single-serialized column parses
      // in ONE JSON.parse to the real array -- a double-serialized column
      // would parse to a STRING that itself still needs parsing.
      const conn = db.openConnection();
      const row = conn.prepare('SELECT "Genres" FROM "Books" WHERE "Id" = ?').get(upserted.id) as {
        Genres: string;
      };
      expect(JSON.parse(row.Genres)).toEqual(["Fantasy", "Adventure"]);

      // A fresh get() (independent read path) must also see the real array.
      const fetched = bookRepo.get(upserted.id);
      expect(fetched.genres).toEqual(["Fantasy", "Adventure"]);
    });

    it("update-branch (id != 0): stores JSON-embedded columns single-encoded, not double-encoded", () => {
      const author = insertAuthor();
      const existing = insertBook(author.authorMetadataId, { genres: ["Old Genre"] });

      const upserted = bookRepo.upsert({ ...existing, genres: ["New Genre", "Second Genre"] });

      expect(upserted.id).toBe(existing.id);
      expect(upserted.genres).toEqual(["New Genre", "Second Genre"]);

      const conn = db.openConnection();
      const row = conn.prepare('SELECT "Genres" FROM "Books" WHERE "Id" = ?').get(existing.id) as {
        Genres: string;
      };
      expect(JSON.parse(row.Genres)).toEqual(["New Genre", "Second Genre"]);

      const fetched = bookRepo.get(existing.id);
      expect(fetched.genres).toEqual(["New Genre", "Second Genre"]);
    });
  });
});
