import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { DownloadHistoryRepository } from "../downloadHistoryRepository.js";
import { DownloadHistoryEventType, newDownloadHistory } from "../downloadHistory.js";

describe("DownloadHistoryRepository", () => {
  let db: MainDatabase;
  let repo: DownloadHistoryRepository;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new DownloadHistoryRepository(db);
  });

  it("round-trips fields including JSON-embedded release/data through insert + get", () => {
    const inserted = repo.insert(
      newDownloadHistory({
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 5,
        downloadId: "abc123",
        sourceTitle: "Some Author - Some Book",
        date: "2026-01-01T00:00:00.000Z",
        protocol: 2,
        indexerId: 9,
        downloadClientId: 3,
        release: { title: "Some Author - Some Book" } as never,
        data: { Indexer: "MyIndexer", DownloadClient: "sab" },
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.eventType).toBe(DownloadHistoryEventType.DownloadGrabbed);
    expect(stored.authorId).toBe(5);
    expect(stored.downloadId).toBe("abc123");
    expect(stored.protocol).toBe(2);
    expect(stored.indexerId).toBe(9);
    expect(stored.downloadClientId).toBe(3);
    expect(stored.release).toEqual({ title: "Some Author - Some Book" });
    expect(stored.data).toEqual({ Indexer: "MyIndexer", DownloadClient: "sab" });
  });

  it("defaults data to {} and release/protocol/indexerId/downloadClientId to null", () => {
    const inserted = repo.insert(newDownloadHistory({ downloadId: "x" }));
    const stored = repo.get(inserted.id);

    expect(stored.data).toEqual({});
    expect(stored.release).toBeNull();
    expect(stored.protocol).toBeNull();
    expect(stored.indexerId).toBeNull();
    expect(stored.downloadClientId).toBeNull();
  });

  it("find() returns undefined for a missing id", () => {
    expect(repo.find(999)).toBeUndefined();
  });

  it("get() throws for a missing id", () => {
    expect(() => repo.get(999)).toThrow();
  });

  it("insert() throws if the model already has a non-zero id", () => {
    expect(() => repo.insert(newDownloadHistory({ id: 5 }))).toThrow(/existing ID/);
  });

  it("findByDownloadId() returns matching rows ordered by date descending", () => {
    repo.insert(
      newDownloadHistory({
        downloadId: "shared",
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        date: "2026-01-01T00:00:00.000Z",
      })
    );
    repo.insert(
      newDownloadHistory({
        downloadId: "shared",
        eventType: DownloadHistoryEventType.DownloadImported,
        date: "2026-01-03T00:00:00.000Z",
      })
    );
    repo.insert(
      newDownloadHistory({
        downloadId: "shared",
        eventType: DownloadHistoryEventType.DownloadFailed,
        date: "2026-01-02T00:00:00.000Z",
      })
    );
    repo.insert(newDownloadHistory({ downloadId: "other", date: "2026-01-05T00:00:00.000Z" }));

    const results = repo.findByDownloadId("shared");
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.eventType)).toEqual([
      DownloadHistoryEventType.DownloadImported,
      DownloadHistoryEventType.DownloadFailed,
      DownloadHistoryEventType.DownloadGrabbed,
    ]);
  });

  it("deleteByAuthorId() removes only that author's rows", () => {
    repo.insert(newDownloadHistory({ authorId: 1, downloadId: "a" }));
    repo.insert(newDownloadHistory({ authorId: 1, downloadId: "b" }));
    repo.insert(newDownloadHistory({ authorId: 2, downloadId: "c" }));

    repo.deleteByAuthorId(1);

    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]?.authorId).toBe(2);
  });
});
