import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { AuthorStatisticsRepository } from "../authorStatisticsRepository.js";

/**
 * Seeds the minimal Authors/Books/Editions/BookFiles rows the ported
 * AuthorStatisticsRepository SQL joins against, matching the real schema
 * (db/migrations/0001_initial_setup.sql).
 */
function seedAuthor(
  db: MainDatabase,
  { authorId, authorMetadataId }: { authorId: number; authorMetadataId: number }
): void {
  db.openConnection()
    .prepare(
      'INSERT INTO "Authors" ("Id", "CleanName", "Path", "Monitored", "AuthorMetadataId") VALUES (?, ?, ?, 1, ?)'
    )
    .run(authorId, `author${authorId}`, `/books/author${authorId}`, authorMetadataId);
}

function seedBook(
  db: MainDatabase,
  {
    bookId,
    authorMetadataId,
    monitored,
    releaseDate,
  }: { bookId: number; authorMetadataId: number; monitored: boolean; releaseDate: string | null }
): void {
  db.openConnection()
    .prepare(
      'INSERT INTO "Books" ("Id", "AuthorMetadataId", "ForeignBookId", "TitleSlug", "Title", "ReleaseDate", "CleanTitle", "Monitored", "AnyEditionOk") VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
    )
    .run(
      bookId,
      authorMetadataId,
      `fb-${bookId}`,
      `slug-${bookId}`,
      `Book ${bookId}`,
      releaseDate,
      `book ${bookId}`,
      monitored ? 1 : 0
    );
}

function seedEdition(
  db: MainDatabase,
  { editionId, bookId, monitored }: { editionId: number; bookId: number; monitored: boolean }
): void {
  db.openConnection()
    .prepare(
      'INSERT INTO "Editions" ("Id", "BookId", "ForeignEditionId", "Title", "TitleSlug", "Images", "Monitored", "ManualAdd") VALUES (?, ?, ?, ?, ?, \'[]\', ?, 0)'
    )
    .run(
      editionId,
      bookId,
      `fe-${editionId}`,
      `Edition ${editionId}`,
      `eslug-${editionId}`,
      monitored ? 1 : 0
    );
}

function seedBookFile(
  db: MainDatabase,
  { editionId, size }: { editionId: number; size: number }
): void {
  db.openConnection()
    .prepare(
      'INSERT INTO "BookFiles" ("EditionId", "CalibreId", "Quality", "Size", "DateAdded", "Path") VALUES (?, 0, \'{}\', ?, ?, ?)'
    )
    .run(editionId, size, new Date().toISOString(), `/books/file-${editionId}-${size}.epub`);
}

describe("AuthorStatisticsRepository", () => {
  let db: MainDatabase;
  let repo: AuthorStatisticsRepository;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new AuthorStatisticsRepository(db);
  });

  it("counts a book with a file as available and counted, summing file sizes", () => {
    seedAuthor(db, { authorId: 1, authorMetadataId: 1 });
    seedBook(db, {
      bookId: 10,
      authorMetadataId: 1,
      monitored: true,
      releaseDate: "2020-01-01T00:00:00.000Z",
    });
    seedEdition(db, { editionId: 100, bookId: 10, monitored: true });
    seedBookFile(db, { editionId: 100, size: 1000 });
    seedBookFile(db, { editionId: 100, size: 2000 });

    const stats = repo.authorStatistics();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      authorId: 1,
      bookId: 10,
      sizeOnDisk: 3000,
      bookFileCount: 2,
      availableBookCount: 1,
      bookCount: 1,
      totalBookCount: 1,
    });
  });

  it("counts a released, monitored book with no file as counted but unavailable", () => {
    seedAuthor(db, { authorId: 2, authorMetadataId: 2 });
    seedBook(db, {
      bookId: 20,
      authorMetadataId: 2,
      monitored: true,
      releaseDate: "2000-01-01T00:00:00.000Z",
    });
    seedEdition(db, { editionId: 200, bookId: 20, monitored: true });

    const stats = repo.authorStatistics();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      bookCount: 1,
      availableBookCount: 0,
      bookFileCount: 0,
      sizeOnDisk: 0,
    });
  });

  it("does not count an unmonitored, unreleased book with no file", () => {
    seedAuthor(db, { authorId: 3, authorMetadataId: 3 });
    // Not monitored and released far in the future -> BookCount should be 0.
    seedBook(db, {
      bookId: 30,
      authorMetadataId: 3,
      monitored: false,
      releaseDate: "2999-01-01T00:00:00.000Z",
    });
    seedEdition(db, { editionId: 300, bookId: 30, monitored: true });

    const stats = repo.authorStatistics();
    expect(stats).toHaveLength(1);
    expect(stats[0]?.bookCount).toBe(0);
  });

  it("excludes unmonitored editions entirely (Editions.Monitored = 1 filter)", () => {
    seedAuthor(db, { authorId: 4, authorMetadataId: 4 });
    seedBook(db, { bookId: 40, authorMetadataId: 4, monitored: true, releaseDate: null });
    seedEdition(db, { editionId: 400, bookId: 40, monitored: false });

    const stats = repo.authorStatistics();
    expect(stats).toHaveLength(0);
  });

  it("authorStatisticsByAuthor() filters to a single author", () => {
    seedAuthor(db, { authorId: 5, authorMetadataId: 5 });
    seedAuthor(db, { authorId: 6, authorMetadataId: 6 });
    seedBook(db, { bookId: 50, authorMetadataId: 5, monitored: true, releaseDate: null });
    seedEdition(db, { editionId: 500, bookId: 50, monitored: true });
    seedBook(db, { bookId: 60, authorMetadataId: 6, monitored: true, releaseDate: null });
    seedEdition(db, { editionId: 600, bookId: 60, monitored: true });

    const stats = repo.authorStatisticsByAuthor(5);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.authorId).toBe(5);
  });

  it("returns an empty list when there are no authors", () => {
    expect(repo.authorStatistics()).toEqual([]);
  });
});
