import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { SeriesRepository } from "../seriesRepository.js";
import { SeriesBookLinkRepository } from "../seriesBookLinkRepository.js";
import { BookRepository } from "../bookRepository.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { newAuthor, newAuthorMetadata, newBook, type Author, type Book, type Series } from "../models.js";

describe("SeriesRepository / SeriesBookLinkRepository", () => {
  let db: MainDatabase;
  let seriesRepo: SeriesRepository;
  let linkRepo: SeriesBookLinkRepository;
  let bookRepo: BookRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;

  beforeEach(() => {
    db = createTestDatabase();
    seriesRepo = new SeriesRepository(db);
    linkRepo = new SeriesBookLinkRepository(db);
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
    } as never);
    return authorRepo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: `author${foreignAuthorId}`,
      path: `/books/${foreignAuthorId}`,
    } as Author);
  }

  function insertBook(authorMetadataId: number, overrides: Partial<Book> = {}): Book {
    return bookRepo.insert({
      ...newBook(),
      authorMetadataId,
      foreignBookId: overrides.foreignBookId ?? `fb-${Math.random()}`,
      titleSlug: overrides.titleSlug ?? `title-${Math.random()}`,
      title: overrides.title ?? "A Book",
      cleanTitle: overrides.cleanTitle ?? "abook",
      ...overrides,
    } as Book);
  }

  function insertSeries(overrides: Partial<Series> = {}): Series {
    return seriesRepo.insert({
      foreignSeriesId: overrides.foreignSeriesId ?? `fs-${Math.random()}`,
      title: overrides.title ?? "A Series",
      description: null,
      numbered: true,
      workCount: 1,
      primaryWorkCount: 1,
      id: 0,
      ...overrides,
    } as Series);
  }

  describe("SeriesRepository", () => {
    it("findById finds a single series by ForeignSeriesId", () => {
      const series = insertSeries({ foreignSeriesId: "fs-1" });
      expect(seriesRepo.findById("fs-1")?.id).toBe(series.id);
      expect(seriesRepo.findById("missing")).toBeUndefined();
    });

    it("findByIds finds multiple series", () => {
      const a = insertSeries({ foreignSeriesId: "fs-a" });
      insertSeries({ foreignSeriesId: "fs-b" });
      const c = insertSeries({ foreignSeriesId: "fs-c" });

      const found = seriesRepo.findByIds(["fs-a", "fs-c", "fs-missing"]);
      expect(found.map((s) => s.id).sort()).toEqual([a.id, c.id].sort());
    });

    it("getByAuthorMetadataId / getByAuthorId join through SeriesBookLink -> Books (-> Authors), distinct", () => {
      const author = insertAuthor();
      const book1 = insertBook(author.authorMetadataId);
      const book2 = insertBook(author.authorMetadataId);
      const series = insertSeries();

      linkRepo.insert({ seriesId: series.id, bookId: book1.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never);
      linkRepo.insert({ seriesId: series.id, bookId: book2.id, position: "2", seriesPosition: 2, isPrimary: false, id: 0 } as never);

      const byMeta = seriesRepo.getByAuthorMetadataId(author.authorMetadataId);
      expect(byMeta.map((s) => s.id)).toEqual([series.id]);

      const byAuthor = seriesRepo.getByAuthorId(author.id);
      expect(byAuthor.map((s) => s.id)).toEqual([series.id]);
    });
  });

  describe("SeriesBookLinkRepository", () => {
    it("getLinksBySeries returns links for a series", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      const series = insertSeries();
      const link = linkRepo.insert({ seriesId: series.id, bookId: book.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never);

      expect(linkRepo.getLinksBySeries(series.id).map((l) => l.id)).toEqual([link.id]);
    });

    it("getLinksBySeriesAndAuthor joins through Books -> AuthorMetadata", () => {
      const author = insertAuthor("fa-target");
      const otherAuthor = insertAuthor("fa-other");
      const book = insertBook(author.authorMetadataId);
      const otherBook = insertBook(otherAuthor.authorMetadataId);
      const series = insertSeries();

      const link = linkRepo.insert({ seriesId: series.id, bookId: book.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never);
      linkRepo.insert({ seriesId: series.id, bookId: otherBook.id, position: "2", seriesPosition: 2, isPrimary: false, id: 0 } as never);

      const found = linkRepo.getLinksBySeriesAndAuthor(series.id, "fa-target");
      expect(found.map((l) => l.id)).toEqual([link.id]);
    });

    it("getLinksByBook populates .series on each result", () => {
      const author = insertAuthor();
      const book = insertBook(author.authorMetadataId);
      const series = insertSeries({ title: "The Series" });
      const link = linkRepo.insert({ seriesId: series.id, bookId: book.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never);

      const found = linkRepo.getLinksByBook([book.id]);
      expect(found).toHaveLength(1);
      expect(found[0]!.id).toBe(link.id);
      expect(found[0]!.series?.title).toBe("The Series");

      expect(linkRepo.getLinksByBook([])).toEqual([]);
    });
  });
});
