import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { HistoryRepository } from "../historyRepository.js";
import { newEntityHistory, EntityHistoryEventType } from "../entityHistory.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { PagingSpec, SortDirection } from "../../db/paging-spec.js";
import type { EntityHistory } from "../entityHistory.js";

function seedAuthor(db: MainDatabase, id: number, authorMetadataId = id): void {
  db.openConnection()
    .prepare(
      'INSERT INTO "Authors" ("Id", "CleanName", "Path", "Monitored", "AuthorMetadataId") VALUES (?, ?, ?, 1, ?)'
    )
    .run(id, `author${id}`, `/books/author${id}`, authorMetadataId);
}

function seedBook(db: MainDatabase, id: number, authorMetadataId: number): void {
  db.openConnection()
    .prepare(
      'INSERT INTO "Books" ("Id", "AuthorMetadataId", "ForeignBookId", "TitleSlug", "Title", "CleanTitle", "Monitored", "AnyEditionOk") VALUES (?, ?, ?, ?, ?, ?, 1, 1)'
    )
    .run(id, authorMetadataId, `fb-${id}`, `slug-${id}`, `Book ${id}`, `book ${id}`);
}

describe("HistoryRepository", () => {
  let db: MainDatabase;
  let repo: HistoryRepository;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new HistoryRepository(db);
    seedAuthor(db, 1, 1);
    seedAuthor(db, 2, 2);
    seedBook(db, 10, 1);
    seedBook(db, 20, 2);
  });

  it("round-trips fields including JSON-embedded quality/data through insert + get", () => {
    const inserted = repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        sourceTitle: "Some Book",
        quality: newQualityModel(),
        date: "2026-01-01T00:00:00.000Z",
        eventType: EntityHistoryEventType.Grabbed,
        data: { Indexer: "MyIndexer" },
        downloadId: "abc123",
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.authorId).toBe(1);
    expect(stored.bookId).toBe(10);
    expect(stored.eventType).toBe(EntityHistoryEventType.Grabbed);
    expect(stored.data).toEqual({ Indexer: "MyIndexer" });
    expect(stored.downloadId).toBe("abc123");
  });

  it("mostRecentForBook() returns the row with the latest Date", () => {
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        date: "2026-01-01T00:00:00.000Z",
      })
    );
    const latest = repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        date: "2026-01-03T00:00:00.000Z",
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        date: "2026-01-02T00:00:00.000Z",
      })
    );

    expect(repo.mostRecentForBook(10)?.id).toBe(latest.id);
  });

  it("mostRecentForDownloadId() returns the row with the latest Date for that downloadId", () => {
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        downloadId: "x",
        date: "2026-01-01T00:00:00.000Z",
      })
    );
    const latest = repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        downloadId: "x",
        date: "2026-01-05T00:00:00.000Z",
      })
    );

    expect(repo.mostRecentForDownloadId("x")?.id).toBe(latest.id);
  });

  it("findByDownloadId() joins Author/Book and returns all matching rows", () => {
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        downloadId: "shared",
      })
    );
    repo.insert(
      newEntityHistory({ authorId: 1, bookId: 10, quality: newQualityModel(), downloadId: "other" })
    );

    const results = repo.findByDownloadId("shared");
    expect(results).toHaveLength(1);
    expect(results[0]?.author?.id).toBe(1);
    expect(results[0]?.book?.title).toBe("Book 10");
  });

  it("getByAuthor() filters by eventType when given, ordered by Date descending", () => {
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        eventType: EntityHistoryEventType.Grabbed,
        date: "2026-01-01T00:00:00.000Z",
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        eventType: EntityHistoryEventType.DownloadFailed,
        date: "2026-01-02T00:00:00.000Z",
      })
    );

    expect(repo.getByAuthor(1, null)).toHaveLength(2);
    expect(repo.getByAuthor(1, EntityHistoryEventType.Grabbed)).toHaveLength(1);
    expect(repo.getByAuthor(1, EntityHistoryEventType.Grabbed)[0]?.eventType).toBe(
      EntityHistoryEventType.Grabbed
    );
  });

  it("getByBook() joins Book and filters by eventType when given", () => {
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        eventType: EntityHistoryEventType.Grabbed,
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        eventType: EntityHistoryEventType.BookFileImported,
      })
    );

    const all = repo.getByBook(10, null);
    expect(all).toHaveLength(2);
    expect(all[0]?.book?.title).toBe("Book 10");

    expect(repo.getByBook(10, EntityHistoryEventType.Grabbed)).toHaveLength(1);
  });

  it("findDownloadHistory() only returns Grabbed/DownloadFailed/BookFileImported rows matching the exact quality", () => {
    const q1 = newQualityModel();
    const q2 = newQualityModel();
    q2.revision.version = 2;

    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: q1,
        eventType: EntityHistoryEventType.Grabbed,
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: q2,
        eventType: EntityHistoryEventType.Grabbed,
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: q1,
        eventType: EntityHistoryEventType.BookFileDeleted,
      })
    );

    const results = repo.findDownloadHistory(1, q1);
    expect(results).toHaveLength(1);
    expect(results[0]?.eventType).toBe(EntityHistoryEventType.Grabbed);
  });

  it("deleteForAuthor() removes only that author's rows", () => {
    repo.insert(newEntityHistory({ authorId: 1, bookId: 10, quality: newQualityModel() }));
    repo.insert(newEntityHistory({ authorId: 2, bookId: 20, quality: newQualityModel() }));

    repo.deleteForAuthor(1);

    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]?.authorId).toBe(2);
  });

  it("since() returns rows on/after the date, ordered ascending, joined to Author + (left) Book", () => {
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        date: "2026-01-01T00:00:00.000Z",
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        date: "2026-01-05T00:00:00.000Z",
      })
    );
    repo.insert(
      newEntityHistory({
        authorId: 1,
        bookId: 10,
        quality: newQualityModel(),
        date: "2025-01-01T00:00:00.000Z",
      })
    );

    const results = repo.since("2026-01-01T00:00:00.000Z", null);
    expect(results).toHaveLength(2);
    expect(results[0]?.date).toBe("2026-01-01T00:00:00.000Z");
    expect(results[1]?.date).toBe("2026-01-05T00:00:00.000Z");
  });

  it("insertMany()/updateMany() batch insert and update", () => {
    const inserted = repo.insertMany([
      newEntityHistory({ authorId: 1, bookId: 10, quality: newQualityModel(), sourceTitle: "A" }),
      newEntityHistory({ authorId: 1, bookId: 10, quality: newQualityModel(), sourceTitle: "B" }),
    ]);
    expect(inserted).toHaveLength(2);

    const updated: EntityHistory[] = inserted.map((h) => ({
      ...h,
      sourceTitle: h.sourceTitle + "-updated",
    }));
    repo.updateMany(updated);

    expect(repo.get(inserted[0]!.id).sourceTitle).toBe("A-updated");
    expect(repo.get(inserted[1]!.id).sourceTitle).toBe("B-updated");
  });

  it("getPaged() pages, sorts, and populates Records/TotalRecords on the same spec instance", () => {
    for (let i = 1; i <= 5; i++) {
      repo.insert(
        newEntityHistory({
          authorId: 1,
          bookId: 10,
          quality: newQualityModel(),
          date: `2026-01-0${i}T00:00:00.000Z`,
        })
      );
    }

    const spec = new PagingSpec<EntityHistory>();
    spec.page = 1;
    spec.pageSize = 2;
    spec.sortKey = "date";
    spec.sortDirection = SortDirection.Descending;

    const result = repo.getPaged(spec);

    expect(result).toBe(spec);
    expect(result.totalRecords).toBe(5);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.date).toBe("2026-01-05T00:00:00.000Z");
  });

  it("find() returns undefined and get() throws for a missing id", () => {
    expect(repo.find(999)).toBeUndefined();
    expect(() => repo.get(999)).toThrow();
  });

  it("insert() throws if the model already has a non-zero id", () => {
    expect(() => repo.insert(newEntityHistory({ id: 5, quality: newQualityModel() }))).toThrow(
      /existing ID/
    );
  });
});
