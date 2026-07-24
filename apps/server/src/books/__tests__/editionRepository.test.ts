import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { EditionRepository } from "../editionRepository.js";
import { BookRepository } from "../bookRepository.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import type { MainDatabase } from "../../db/db-factory.js";
import {
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  type Author,
  type Book,
  type Edition,
} from "../models.js";

describe("EditionRepository", () => {
  let db: MainDatabase;
  let editionRepo: EditionRepository;
  let bookRepo: BookRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;

  beforeEach(() => {
    db = createTestDatabase();
    editionRepo = new EditionRepository(db);
    bookRepo = new BookRepository(db);
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
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

  function insertBook(authorMetadataId: number, overrides: Partial<Book> = {}): Book {
    return bookRepo.insert({
      ...newBook(),
      authorMetadataId,
      foreignBookId: overrides.foreignBookId ?? `fb-${Math.random()}`,
      titleSlug: overrides.titleSlug ?? `title-${Math.random()}`,
      title: overrides.title ?? "A Book",
      cleanTitle: overrides.cleanTitle ?? "abook",
      anyEditionOk: overrides.anyEditionOk ?? false,
      ...overrides,
    });
  }

  function insertEdition(bookId: number, overrides: Partial<Edition> = {}): Edition {
    return editionRepo.insert({
      ...newEdition(),
      bookId,
      foreignEditionId: overrides.foreignEditionId ?? `fe-${Math.random()}`,
      titleSlug: overrides.titleSlug ?? `edslug-${Math.random()}`,
      title: overrides.title ?? "Edition",
      monitored: overrides.monitored ?? false,
      ...overrides,
    });
  }

  it("round-trips overview default (empty string, not null)", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const inserted = insertEdition(book.id);

    expect(editionRepo.get(inserted.id).overview).toBe("");
  });

  it("getAllMonitoredEditions returns only Monitored = true rows", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    insertEdition(book.id, { monitored: true, title: "Monitored" });
    insertEdition(book.id, { monitored: false, title: "Unmonitored" });

    const monitored = editionRepo.getAllMonitoredEditions();
    expect(monitored.map((e) => e.title)).toEqual(["Monitored"]);
  });

  it("findByForeignEditionId finds a single edition by ForeignEditionId", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const edition = insertEdition(book.id, { foreignEditionId: "fe-unique" });

    expect(editionRepo.findByForeignEditionId("fe-unique")?.id).toBe(edition.id);
    expect(editionRepo.findByForeignEditionId("missing")).toBeUndefined();
  });

  describe("getEditionsForRefresh", () => {
    it("matches by BookId OR any of the given ForeignEditionIds", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      const otherBook = insertBook(author.authorMetadataId);
      insertEdition(book.id, { foreignEditionId: "fe-1" });
      const foreignEdition = insertEdition(otherBook.id, { foreignEditionId: "fe-2" });

      const results = editionRepo.getEditionsForRefresh(book.id, ["fe-2"]);
      expect(results.map((e) => e.id)).toContain(foreignEdition.id);
    });
  });

  it("findByBook populates .book on each result", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId, { title: "Parent Book" });
    const edition = insertEdition(book.id);

    const found = editionRepo.findByBook([book.id]);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(edition.id);
    expect(found[0]!.book?.id).toBe(book.id);
    expect(found[0]!.book?.title).toBe("Parent Book");

    expect(editionRepo.findByBook([])).toEqual([]);
  });

  it("findByAuthor joins through Books -> Authors on author Id", () => {
    const author = insertAuthor("fa-1");
    const otherAuthor = insertAuthor("fa-2");
    const book = insertBook(author.authorMetadataId);
    const otherBook = insertBook(otherAuthor.authorMetadataId);
    const edition = insertEdition(book.id);
    insertEdition(otherBook.id);

    const found = editionRepo.findByAuthor(author.id);
    expect(found.map((e) => e.id)).toEqual([edition.id]);
  });

  describe("findByAuthorMetadataId", () => {
    it("without onlyMonitored, matches purely by Book.AuthorMetadataId", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      insertEdition(book.id, { monitored: false });

      expect(editionRepo.findByAuthorMetadataId(author.authorMetadataId, false)).toHaveLength(1);
    });

    it("with onlyMonitored, ORs in Editions.Monitored/Book.AnyEditionOk (faithful OrWhere quirk)", () => {
      const author = insertAuthor("fa-1");
      const otherAuthor = insertAuthor("fa-2");
      const otherBook = insertBook(otherAuthor.authorMetadataId, { anyEditionOk: false });
      insertEdition(otherBook.id, { monitored: true });

      // The other author's monitored edition is pulled in even though it
      // doesn't belong to `author` -- this is the real (odd) C# behavior
      // being preserved, not a bug in the port. See editionRepository.ts's
      // findByAuthorMetadataId doc comment.
      const results = editionRepo.findByAuthorMetadataId(author.authorMetadataId, true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  it("findByTitle returns the first monitored edition matching the title (FirstOrDefault, not exclusive)", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    insertEdition(book.id, { title: "Hardcover", monitored: true });
    insertEdition(book.id, { title: "Hardcover", monitored: true });

    expect(editionRepo.findByTitle(author.authorMetadataId, "Hardcover")).toBeDefined();
    expect(editionRepo.findByTitle(author.authorMetadataId, "Missing")).toBeUndefined();
  });

  describe("setMonitored", () => {
    it("monitors exactly the given edition and unmonitors its siblings", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      const e1 = insertEdition(book.id, { monitored: true, title: "One" });
      const e2 = insertEdition(book.id, { monitored: false, title: "Two" });

      const result = editionRepo.setMonitored(e2);

      expect(result.find((e) => e.id === e1.id)?.monitored).toBe(false);
      expect(result.find((e) => e.id === e2.id)?.monitored).toBe(true);
      expect(editionRepo.get(e1.id).monitored).toBe(false);
      expect(editionRepo.get(e2.id).monitored).toBe(true);
    });
  });

  /**
   * Regression coverage for the upsert() double-serialization bugfix -- see
   * bookRepository.test.ts's identical describe block for the full
   * explanation.
   */
  describe("upsert", () => {
    it("insert-branch (id 0): stores JSON-embedded columns single-encoded, not double-encoded", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);

      const upserted = editionRepo.upsert({
        ...newEdition(),
        bookId: book.id,
        foreignEditionId: "fe-upsert-insert",
        titleSlug: "fe-upsert-insert-slug",
        title: "Upserted Edition",
        images: [{ coverType: "cover", url: "/covers/1.jpg" }],
      });

      expect(upserted.id).toBeGreaterThan(0);
      expect(upserted.images).toEqual([{ coverType: "cover", url: "/covers/1.jpg" }]);

      const conn = db.openConnection();
      const row = conn
        .prepare('SELECT "Images" FROM "Editions" WHERE "Id" = ?')
        .get(upserted.id) as { Images: string };
      expect(JSON.parse(row.Images)).toEqual([{ coverType: "cover", url: "/covers/1.jpg" }]);

      const fetched = editionRepo.get(upserted.id);
      expect(fetched.images).toEqual([{ coverType: "cover", url: "/covers/1.jpg" }]);
    });

    it("update-branch (id != 0): stores JSON-embedded columns single-encoded, not double-encoded", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      const existing = insertEdition(book.id, {
        images: [{ coverType: "cover", url: "/covers/old.jpg" }],
      });

      const upserted = editionRepo.upsert({
        ...existing,
        images: [{ coverType: "cover", url: "/covers/new.jpg" }],
      });

      expect(upserted.id).toBe(existing.id);
      expect(upserted.images).toEqual([{ coverType: "cover", url: "/covers/new.jpg" }]);

      const conn = db.openConnection();
      const row = conn
        .prepare('SELECT "Images" FROM "Editions" WHERE "Id" = ?')
        .get(existing.id) as { Images: string };
      expect(JSON.parse(row.Images)).toEqual([{ coverType: "cover", url: "/covers/new.jpg" }]);

      const fetched = editionRepo.get(existing.id);
      expect(fetched.images).toEqual([{ coverType: "cover", url: "/covers/new.jpg" }]);
    });
  });
});
