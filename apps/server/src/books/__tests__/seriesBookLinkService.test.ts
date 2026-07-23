import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { SeriesBookLinkRepository } from "../seriesBookLinkRepository.js";
import { SeriesBookLinkService } from "../seriesBookLinkService.js";
import { SeriesRepository } from "../seriesRepository.js";
import { BookRepository } from "../bookRepository.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { BookDeletedEvent } from "../events.js";
import { newAuthor, newAuthorMetadata, newBook, type Author, type Book, type Series } from "../models.js";

describe("SeriesBookLinkService", () => {
  let db: MainDatabase;
  let linkRepo: SeriesBookLinkRepository;
  let seriesRepo: SeriesRepository;
  let bookRepo: BookRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let service: SeriesBookLinkService;

  beforeEach(() => {
    db = createTestDatabase();
    linkRepo = new SeriesBookLinkRepository(db);
    seriesRepo = new SeriesRepository(db);
    bookRepo = new BookRepository(db);
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    service = new SeriesBookLinkService(linkRepo);
  });

  afterEach(() => {
    db.close();
  });

  function insertAuthor(): Author {
    const meta = metaRepo.insert({ ...newAuthorMetadata(), foreignAuthorId: "fa-1", titleSlug: "s", name: "N" } as never);
    return authorRepo.insert({ ...newAuthor(), authorMetadataId: meta.id, cleanName: "n", path: "/books/N" } as Author);
  }

  function insertBook(authorMetadataId: number): Book {
    return bookRepo.insert({ ...newBook(), authorMetadataId, foreignBookId: "fb-1", titleSlug: "t", title: "T", cleanTitle: "t" } as Book);
  }

  function insertSeries(): Series {
    return seriesRepo.insert({
      foreignSeriesId: "fs-1",
      title: "S",
      description: null,
      numbered: true,
      workCount: 1,
      primaryWorkCount: 1,
      id: 0,
    } as Series);
  }

  it("getLinksBySeries / getLinksBySeriesAndAuthor / getLinksByBook delegate straight through", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const series = insertSeries();
    const link = linkRepo.insert({ seriesId: series.id, bookId: book.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never);

    expect(service.getLinksBySeries(series.id).map((l) => l.id)).toEqual([link.id]);
    expect(service.getLinksBySeriesAndAuthor(series.id, "fa-1").map((l) => l.id)).toEqual([link.id]);
    expect(service.getLinksByBook([book.id]).map((l) => l.id)).toEqual([link.id]);
  });

  it("insertMany / updateMany / deleteMany delegate straight through", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const series = insertSeries();

    service.insertMany([{ seriesId: series.id, bookId: book.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never]);
    expect(linkRepo.count()).toBe(1);

    const [link] = linkRepo.all();
    service.updateMany([{ ...link!, position: "2" }]);
    expect(linkRepo.get(link!.id).position).toBe("2");

    service.deleteMany([link!]);
    expect(linkRepo.count()).toBe(0);
  });

  it("handleBookDeleted removes every link for the deleted book", () => {
    const author = insertAuthor();
    const book = insertBook(author.authorMetadataId);
    const series = insertSeries();
    linkRepo.insert({ seriesId: series.id, bookId: book.id, position: "1", seriesPosition: 1, isPrimary: true, id: 0 } as never);

    service.handleBookDeleted(new BookDeletedEvent(book, false, false));

    expect(linkRepo.getLinksByBook([book.id])).toEqual([]);
  });
});
