import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { EditionRepository } from "../editionRepository.js";
import { BookRepository } from "../bookRepository.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import { EditionService } from "../editionService.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { BookDeletedEvent, EditionDeletedEvent, type BooksDomainEvent, type IBooksEventAggregator } from "../events.js";
import { NullTextMatcher } from "../textMatching.js";
import { newAuthor, newAuthorMetadata, newBook, newEdition, type Author, type Book, type Edition } from "../models.js";

class CapturingEventAggregator implements IBooksEventAggregator {
  events: BooksDomainEvent[] = [];
  publishEvent(event: BooksDomainEvent): void {
    this.events.push(event);
  }
}

describe("EditionService", () => {
  let db: MainDatabase;
  let editionRepo: EditionRepository;
  let bookRepo: BookRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let events: CapturingEventAggregator;
  let service: EditionService;

  beforeEach(() => {
    db = createTestDatabase();
    editionRepo = new EditionRepository(db);
    bookRepo = new BookRepository(db);
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    events = new CapturingEventAggregator();
    service = new EditionService(editionRepo, events, new NullTextMatcher());
  });

  afterEach(() => {
    db.close();
  });

  function insertAuthor(): Author {
    const meta = metaRepo.insert({ ...newAuthorMetadata(), foreignAuthorId: "fa-1", titleSlug: "s", name: "N" } as never);
    return authorRepo.insert({ ...newAuthor(), authorMetadataId: meta.id, cleanName: "n", path: "/books/N" } as Author);
  }

  function insertBook(authorMetadataId: number): Book {
    return bookRepo.insert({ ...newBook(), authorMetadataId, foreignBookId: "fb-1", titleSlug: "b1", title: "B1", cleanTitle: "b1" } as Book);
  }

  it("getEdition / getEditionByForeignEditionId / getAllMonitoredEditions delegate to the repository", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const edition = editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-1", titleSlug: "fe1", title: "E1", monitored: true } as never);

    expect(service.getEdition(edition.id).id).toBe(edition.id);
    expect(service.getEditionByForeignEditionId("fe-1")?.id).toBe(edition.id);
    expect(service.getAllMonitoredEditions().map((e) => e.id)).toEqual([edition.id]);
  });

  it("deleteMany deletes and publishes one EditionDeletedEvent per edition", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const e1 = editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-1", titleSlug: "fe1", title: "E1" } as never);
    const e2 = editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-2", titleSlug: "fe2", title: "E2" } as never);

    service.deleteMany([e1, e2]);

    expect(editionRepo.all()).toHaveLength(0);
    expect(events.events.filter((e) => e instanceof EditionDeletedEvent)).toHaveLength(2);
  });

  it("getEditionsByBook accepts either a single id or an array", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const edition = editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-1", titleSlug: "fe1", title: "E1" } as never);

    expect(service.getEditionsByBook(book.id).map((e) => e.id)).toEqual([edition.id]);
    expect(service.getEditionsByBook([book.id]).map((e) => e.id)).toEqual([edition.id]);
  });

  it("setMonitored delegates to the repository (unmonitors siblings)", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const e1 = editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-1", titleSlug: "fe1", title: "E1", monitored: true } as never);
    const e2 = editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-2", titleSlug: "fe2", title: "E2", monitored: false } as never);

    service.setMonitored(e2);

    expect(editionRepo.get(e1.id).monitored).toBe(false);
    expect(editionRepo.get(e2.id).monitored).toBe(true);
  });

  it("handleBookDeleted deletes every edition of that book", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    editionRepo.insert({ ...newEdition(), bookId: book.id, foreignEditionId: "fe-1", titleSlug: "fe1", title: "E1" } as never);

    service.handleBookDeleted(new BookDeletedEvent(book, false, false));

    expect(editionRepo.all()).toHaveLength(0);
  });
});
