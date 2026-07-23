import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { BlocklistRepository } from "../blocklistRepository.js";
import { newBlocklist } from "../blocklist.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { PagingSpec, SortDirection } from "../../db/paging-spec.js";
import type { Blocklist } from "../blocklist.js";

describe("BlocklistRepository", () => {
  let db: MainDatabase;
  let repo: BlocklistRepository;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new BlocklistRepository(db);
  });

  it("round-trips fields including JSON-embedded quality/bookIds through insert + get", () => {
    const inserted = repo.insert(
      newBlocklist({
        authorId: 5,
        bookIds: [1, 2, 3],
        sourceTitle: "Some Author - Some Book",
        quality: newQualityModel(),
        date: "2026-01-01T00:00:00.000Z",
        publishedDate: "2025-12-31T00:00:00.000Z",
        size: 12345,
        protocol: 2,
        indexer: "MyIndexer",
        message: "release blocked",
        torrentInfoHash: "abc123",
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.authorId).toBe(5);
    expect(stored.bookIds).toEqual([1, 2, 3]);
    expect(stored.sourceTitle).toBe("Some Author - Some Book");
    expect(stored.publishedDate).toBe("2025-12-31T00:00:00.000Z");
    expect(stored.size).toBe(12345);
    expect(stored.indexer).toBe("MyIndexer");
    expect(stored.message).toBe("release blocked");
    expect(stored.torrentInfoHash).toBe("abc123");
  });

  it("find() returns undefined for a missing id", () => {
    expect(repo.find(999)).toBeUndefined();
  });

  it("get() throws for a missing id", () => {
    expect(() => repo.get(999)).toThrow();
  });

  it("insert() throws if the model already has a non-zero id", () => {
    expect(() => repo.insert(newBlocklist({ id: 5, quality: newQualityModel() }))).toThrow(
      /existing ID/
    );
  });

  it("blocklistedByTitle() matches on partial (Contains) sourceTitle for the given author", () => {
    repo.insert(
      newBlocklist({
        authorId: 1,
        sourceTitle: "Author One - Book One",
        quality: newQualityModel(),
      })
    );
    repo.insert(
      newBlocklist({
        authorId: 1,
        sourceTitle: "Something else entirely",
        quality: newQualityModel(),
      })
    );
    repo.insert(
      newBlocklist({
        authorId: 2,
        sourceTitle: "Author One - Book One",
        quality: newQualityModel(),
      })
    );

    const results = repo.blocklistedByTitle(1, "Book One");
    expect(results).toHaveLength(1);
    expect(results[0]?.sourceTitle).toBe("Author One - Book One");
  });

  it("blocklistedByTorrentInfoHash() matches on partial hash for the given author", () => {
    repo.insert(
      newBlocklist({ authorId: 1, torrentInfoHash: "abcdef123456", quality: newQualityModel() })
    );
    repo.insert(
      newBlocklist({ authorId: 2, torrentInfoHash: "abcdef123456", quality: newQualityModel() })
    );

    const results = repo.blocklistedByTorrentInfoHash(1, "abcdef");
    expect(results).toHaveLength(1);
    expect(results[0]?.authorId).toBe(1);
  });

  it("blocklistedByAuthor() returns only that author's rows", () => {
    repo.insert(newBlocklist({ authorId: 1, quality: newQualityModel() }));
    repo.insert(newBlocklist({ authorId: 1, quality: newQualityModel() }));
    repo.insert(newBlocklist({ authorId: 2, quality: newQualityModel() }));

    expect(repo.blocklistedByAuthor(1)).toHaveLength(2);
    expect(repo.blocklistedByAuthor(2)).toHaveLength(1);
  });

  it("deleteMany() removes only the given rows (by model or by id)", () => {
    const a = repo.insert(newBlocklist({ authorId: 1, quality: newQualityModel() }));
    const b = repo.insert(newBlocklist({ authorId: 2, quality: newQualityModel() }));
    repo.insert(newBlocklist({ authorId: 3, quality: newQualityModel() }));

    repo.deleteMany([a, b]);

    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]?.authorId).toBe(3);
  });

  it("purge() removes all rows", () => {
    repo.insert(newBlocklist({ authorId: 1, quality: newQualityModel() }));
    repo.insert(newBlocklist({ authorId: 2, quality: newQualityModel() }));

    repo.purge();

    expect(repo.all()).toHaveLength(0);
  });

  it("getPaged() pages and sorts, populating Records/TotalRecords on the same spec instance", () => {
    for (let i = 1; i <= 5; i++) {
      repo.insert(
        newBlocklist({
          authorId: 1,
          sourceTitle: `Book ${i}`,
          quality: newQualityModel(),
          date: `2026-01-0${i}T00:00:00.000Z`,
        })
      );
    }

    const spec = new PagingSpec<Blocklist>();
    spec.page = 1;
    spec.pageSize = 2;
    spec.sortKey = "date";
    spec.sortDirection = SortDirection.Descending;

    const result = repo.getPaged(spec);

    expect(result).toBe(spec);
    expect(result.totalRecords).toBe(5);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.sourceTitle).toBe("Book 5");
  });
});
