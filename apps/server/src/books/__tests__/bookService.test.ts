import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { BookRepository } from "../bookRepository.js";
import { EditionRepository } from "../editionRepository.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import { BookService } from "../bookService.js";
import { EditionService } from "../editionService.js";
import type { MainDatabase } from "../../db/db-factory.js";
import {
  AuthorDeletedEvent,
  BookAddedEvent,
  BookDeletedEvent,
  BookEditedEvent,
  type BooksDomainEvent,
  type IBooksEventAggregator,
} from "../events.js";
import { NullTextMatcher } from "../textMatching.js";
import {
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  type Author,
  type Book,
  type Edition,
} from "../models.js";

class CapturingEventAggregator implements IBooksEventAggregator {
  events: BooksDomainEvent[] = [];
  publishEvent(event: BooksDomainEvent): void {
    this.events.push(event);
  }
}

describe("BookService", () => {
  let db: MainDatabase;
  let bookRepo: BookRepository;
  let editionRepo: EditionRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let events: CapturingEventAggregator;
  let editionService: EditionService;
  let service: BookService;

  beforeEach(() => {
    db = createTestDatabase();
    bookRepo = new BookRepository(db);
    editionRepo = new EditionRepository(db);
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    events = new CapturingEventAggregator();
    editionService = new EditionService(editionRepo, events, new NullTextMatcher());
    service = new BookService(bookRepo, editionService, events, new NullTextMatcher());
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
    });
  }

  describe("addBook", () => {
    it("throws when AuthorMetadataId is 0", () => {
      const book = { ...newBook(), authorMetadataId: 0, editions: [] } as Book;
      expect(() => service.addBook(book)).toThrow(/AuthorMetadataId = 0/);
    });

    it("inserts the book, inserts new editions, monitors exactly one edition, and publishes BookAddedEvent", () => {
      const author = insertAuthor();
      const edition1: Edition = {
        ...newEdition(),
        id: 0,
        foreignEditionId: "fe-1",
        titleSlug: "fe1",
        title: "Ed1",
        monitored: true,
      };
      const edition2: Edition = {
        ...newEdition(),
        id: 0,
        foreignEditionId: "fe-2",
        titleSlug: "fe2",
        title: "Ed2",
        monitored: false,
      };

      const book = {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        foreignBookId: "fb-1",
        titleSlug: "book-1",
        title: "Book One",
        cleanTitle: "bookone",
        editions: [edition1, edition2],
      } as Book;

      const inserted = service.addBook(book, true);

      expect(inserted.id).toBeGreaterThan(0);

      const editions = editionRepo.findByBook([inserted.id]);
      expect(editions).toHaveLength(2);
      expect(editions.filter((e) => e.monitored)).toHaveLength(1);
      expect(editions.find((e) => e.monitored)?.foreignEditionId).toBe("fe-1");

      expect(events.events[0]).toBeInstanceOf(BookAddedEvent);
      expect((events.events[0] as BookAddedEvent).doRefresh).toBe(true);
    });

    it("falls back to the first edition if none is monitored", () => {
      const author = insertAuthor();
      const edition1: Edition = {
        ...newEdition(),
        id: 0,
        foreignEditionId: "fe-1",
        titleSlug: "fe1",
        title: "Ed1",
        monitored: false,
      };

      const book = {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        foreignBookId: "fb-1",
        titleSlug: "book-1",
        title: "Book One",
        cleanTitle: "bookone",
        editions: [edition1],
      } as Book;

      service.addBook(book);

      const editions = editionRepo.findByBook([bookRepo.findById("fb-1")!.id]);
      expect(editions[0]!.monitored).toBe(true);
    });
  });

  it("deleteBook removes the row and publishes BookDeletedEvent", () => {
    const author = insertAuthor();
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-1",
      titleSlug: "b1",
      title: "B1",
      cleanTitle: "b1",
    });

    service.deleteBook(book.id, true, false);

    expect(bookRepo.find(book.id)).toBeUndefined();
    expect(events.events[0]).toBeInstanceOf(BookDeletedEvent);
  });

  it("findById / findBySlug / findByTitle delegate to the repository", () => {
    const author = insertAuthor();
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-1",
      titleSlug: "b1",
      title: "B1",
      cleanTitle: "b1",
    });

    expect(service.findById("fb-1")?.id).toBe(book.id);
    expect(service.findBySlug("b1")?.id).toBe(book.id);
    expect(service.findByTitle(author.authorMetadataId, "B1")?.id).toBe(book.id);
  });

  it("insertMany throws when any book has AuthorMetadataId 0", () => {
    expect(() => service.insertMany([{ ...newBook(), authorMetadataId: 0 }])).toThrow(
      /AuthorMetadataId = 0/
    );
  });

  it("deleteMany deletes and publishes one BookDeletedEvent per book", () => {
    const author = insertAuthor();
    const b1 = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-1",
      titleSlug: "b1",
      title: "B1",
      cleanTitle: "b1",
    });
    const b2 = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-2",
      titleSlug: "b2",
      title: "B2",
      cleanTitle: "b2",
    });

    service.deleteMany([b1, b2]);

    expect(bookRepo.all()).toHaveLength(0);
    expect(events.events.filter((e) => e instanceof BookDeletedEvent)).toHaveLength(2);
  });

  it("updateBook publishes BookEditedEvent with old and new state", () => {
    const author = insertAuthor();
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-1",
      titleSlug: "b1",
      title: "B1",
      cleanTitle: "b1",
    });

    service.updateBook({ ...book, title: "B1 Updated" });

    const event = events.events[0] as BookEditedEvent;
    expect(event).toBeInstanceOf(BookEditedEvent);
    expect(event.book.title).toBe("B1 Updated");
    expect(event.oldBook.title).toBe("B1");
  });

  describe("setBookMonitored / setMonitored", () => {
    it("setBookMonitored flips Monitored and publishes a self-referential BookEditedEvent", () => {
      const author = insertAuthor();
      const book = bookRepo.insert({
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        foreignBookId: "fb-1",
        titleSlug: "b1",
        title: "B1",
        cleanTitle: "b1",
        monitored: false,
      });

      service.setBookMonitored(book.id, true);

      expect(bookRepo.get(book.id).monitored).toBe(true);
      expect(events.events[0]).toBeInstanceOf(BookEditedEvent);
    });

    it("setMonitored bulk-flips and publishes one event per book", () => {
      const author = insertAuthor();
      const b1 = bookRepo.insert({
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        foreignBookId: "fb-1",
        titleSlug: "b1",
        title: "B1",
        cleanTitle: "b1",
        monitored: false,
      });
      const b2 = bookRepo.insert({
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        foreignBookId: "fb-2",
        titleSlug: "b2",
        title: "B2",
        cleanTitle: "b2",
        monitored: false,
      });

      service.setMonitored([b1.id, b2.id], true);

      expect(bookRepo.get(b1.id).monitored).toBe(true);
      expect(bookRepo.get(b2.id).monitored).toBe(true);
      expect(events.events).toHaveLength(2);
    });
  });

  it("updateLastSearchTime updates only that field", () => {
    const author = insertAuthor();
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-1",
      titleSlug: "b1",
      title: "B1",
      cleanTitle: "b1",
    });

    service.updateLastSearchTime([
      { ...book, lastSearchTime: "2026-01-01T00:00:00.000Z", title: "should not persist" },
    ]);

    const reloaded = bookRepo.get(book.id);
    expect(reloaded.lastSearchTime).toBe("2026-01-01T00:00:00.000Z");
    expect(reloaded.title).toBe("B1");
  });

  it("handleAuthorDeleted deletes every book belonging to that author's metadata id", () => {
    const author = insertAuthor();
    bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-1",
      titleSlug: "b1",
      title: "B1",
      cleanTitle: "b1",
    });
    bookRepo.insert({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: "fb-2",
      titleSlug: "b2",
      title: "B2",
      cleanTitle: "b2",
    });

    service.handleAuthorDeleted(new AuthorDeletedEvent(author, false, false));

    expect(bookRepo.all()).toHaveLength(0);
  });
});
