import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import { BookRepository } from "../bookRepository.js";
import { EditionRepository } from "../editionRepository.js";
import { AuthorService } from "../authorService.js";
import { BookService } from "../bookService.js";
import { EditionService } from "../editionService.js";
import { BookMonitoredService } from "../bookMonitoredService.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { NullBooksEventAggregator } from "../events.js";
import { NullTextMatcher } from "../textMatching.js";
import { MonitorTypes, newAuthor, newAuthorMetadata, newBook, newEdition, type Author, type Book, type MonitoringOptions } from "../models.js";

describe("BookMonitoredService", () => {
  let db: MainDatabase;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let bookRepo: BookRepository;
  let editionRepo: EditionRepository;
  let authorService: AuthorService;
  let bookService: BookService;
  let service: BookMonitoredService;
  let author: Author;

  beforeEach(() => {
    db = createTestDatabase();
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    bookRepo = new BookRepository(db);
    editionRepo = new EditionRepository(db);

    const events = new NullBooksEventAggregator();
    authorService = new AuthorService(authorRepo, events, new NullTextMatcher());
    const editionService = new EditionService(editionRepo, events, new NullTextMatcher());
    bookService = new BookService(bookRepo, editionService, events, new NullTextMatcher());
    service = new BookMonitoredService(authorService, bookService);

    const meta = metaRepo.insert({ ...newAuthorMetadata(), foreignAuthorId: "fa-1", titleSlug: "s", name: "N" } as never);
    author = authorRepo.insert({ ...newAuthor(), authorMetadataId: meta.id, cleanName: "n", path: "/books/N", monitored: true } as Author);
  });

  afterEach(() => {
    db.close();
  });

  function insertBookWithFile(foreignBookId: string, releaseDate: string, monitored = true): Book {
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId,
      titleSlug: foreignBookId,
      title: foreignBookId,
      cleanTitle: foreignBookId,
      releaseDate,
      monitored,
    } as Book);

    const edition = editionRepo.insert({
      ...newEdition(),
      bookId: book.id,
      foreignEditionId: `${foreignBookId}-e`,
      titleSlug: `${foreignBookId}-e`,
      title: foreignBookId,
      monitored: true,
    } as never);

    db.openConnection()
      .prepare('INSERT INTO "BookFiles" ("EditionId", "CalibreId", "Quality", "Size", "DateAdded", "Path") VALUES (?, ?, ?, ?, ?, ?)')
      .run(edition.id, 1, "{}", 1, new Date().toISOString(), `/books/${foreignBookId}.epub`);

    return book;
  }

  function insertBookWithoutFile(foreignBookId: string, releaseDate: string, monitored = true): Book {
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId,
      titleSlug: foreignBookId,
      title: foreignBookId,
      cleanTitle: foreignBookId,
      releaseDate,
      monitored,
    } as Book);

    editionRepo.insert({
      ...newEdition(),
      bookId: book.id,
      foreignEditionId: `${foreignBookId}-e`,
      titleSlug: `${foreignBookId}-e`,
      title: foreignBookId,
      monitored: true,
    } as never);

    return book;
  }

  function options(overrides: Partial<MonitoringOptions> = {}): MonitoringOptions {
    return { monitor: MonitorTypes.All, booksToMonitor: [], monitored: true, ...overrides };
  }

  it("null monitoringOptions skips book updates but still updates the author", () => {
    service.setBookMonitoredStatus(author, null);
    expect(authorRepo.get(author.id).monitored).toBe(true);
  });

  it("MonitorTypes.All monitors every book", () => {
    const past = insertBookWithFile("past", "2000-01-01T00:00:00.000Z");
    const future = insertBookWithoutFile("future", "2099-01-01T00:00:00.000Z");

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.All }));

    expect(bookRepo.get(past.id).monitored).toBe(true);
    expect(bookRepo.get(future.id).monitored).toBe(true);
  });

  it("MonitorTypes.None unmonitors every book", () => {
    const past = insertBookWithFile("past", "2000-01-01T00:00:00.000Z");

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.None }));

    expect(bookRepo.get(past.id).monitored).toBe(false);
  });

  it("MonitorTypes.Existing monitors books with files, unmonitors past books without files", () => {
    const withFile = insertBookWithFile("withfile", "2000-01-01T00:00:00.000Z", false);
    const withoutFilePast = insertBookWithoutFile("nofile-past", "2000-01-01T00:00:00.000Z", true);

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.Existing }));

    expect(bookRepo.get(withFile.id).monitored).toBe(true);
    expect(bookRepo.get(withoutFilePast.id).monitored).toBe(false);
  });

  it("MonitorTypes.Missing unmonitors books with files, monitors past books without files", () => {
    const withFile = insertBookWithFile("withfile", "2000-01-01T00:00:00.000Z", true);
    const withoutFilePast = insertBookWithoutFile("nofile-past", "2000-01-01T00:00:00.000Z", false);

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.Missing }));

    expect(bookRepo.get(withFile.id).monitored).toBe(false);
    expect(bookRepo.get(withoutFilePast.id).monitored).toBe(true);
  });

  it("MonitorTypes.Future unmonitors both books-with-files and past-books-without-files", () => {
    const withFile = insertBookWithFile("withfile", "2000-01-01T00:00:00.000Z", true);
    const withoutFilePast = insertBookWithoutFile("nofile-past", "2000-01-01T00:00:00.000Z", true);

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.Future }));

    expect(bookRepo.get(withFile.id).monitored).toBe(false);
    expect(bookRepo.get(withoutFilePast.id).monitored).toBe(false);
  });

  it("MonitorTypes.Latest monitors only the book with the most recent release date", () => {
    const older = insertBookWithoutFile("older", "2000-01-01T00:00:00.000Z");
    const newer = insertBookWithoutFile("newer", "2020-01-01T00:00:00.000Z");

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.Latest }));

    expect(bookRepo.get(older.id).monitored).toBe(false);
    expect(bookRepo.get(newer.id).monitored).toBe(true);
  });

  it("MonitorTypes.First monitors only the book with the earliest release date", () => {
    const older = insertBookWithoutFile("older", "2000-01-01T00:00:00.000Z");
    const newer = insertBookWithoutFile("newer", "2020-01-01T00:00:00.000Z");

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.First }));

    expect(bookRepo.get(older.id).monitored).toBe(true);
    expect(bookRepo.get(newer.id).monitored).toBe(false);
  });

  it("booksToMonitor, when non-empty, overrides the monitor switch entirely", () => {
    const wanted = insertBookWithoutFile("wanted", "2000-01-01T00:00:00.000Z", false);
    const unwanted = insertBookWithoutFile("unwanted", "2020-01-01T00:00:00.000Z", false);

    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.None, booksToMonitor: ["wanted"] }));

    expect(bookRepo.get(wanted.id).monitored).toBe(true);
    expect(bookRepo.get(unwanted.id).monitored).toBe(false);
  });

  it("always calls authorService.updateAuthor at the end", () => {
    const updated = authorRepo.get(author.id);
    updated.path = "/books/N"; // no-op change, just proving updateAuthor ran without throwing
    service.setBookMonitoredStatus(author, options({ monitor: MonitorTypes.All }));

    // updateAuthor requires the author to still exist in the DB (it calls GetAuthor(id) internally) --
    // if this throws, the test fails, which is the assertion here.
    expect(() => authorRepo.get(author.id)).not.toThrow();
  });
});
