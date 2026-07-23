import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { PendingReleaseRepository } from "../pendingReleaseRepository.js";
import { PendingReleaseReason } from "../pendingReleaseReason.js";
import type { PendingRelease } from "../pendingRelease.js";

function makeRelease(overrides: Partial<PendingRelease> = {}): PendingRelease {
  return {
    id: 0,
    authorId: 1,
    title: "Some Author - Some Book",
    added: "2026-01-01T00:00:00.000Z",
    parsedBookInfo: {
      authorName: "Some Author",
      quality: {} as never,
      discography: false,
    } as never,
    release: {
      title: "Some Author - Some Book",
      indexer: "MyIndexer",
      indexerId: 1,
      publishDate: "2026-01-01T00:00:00.000Z",
    } as never,
    reason: PendingReleaseReason.Delay,
    additionalInfo: { releaseSource: 0 },
    remoteBook: null,
    ...overrides,
  };
}

describe("PendingReleaseRepository", () => {
  let db: MainDatabase;
  let repo: PendingReleaseRepository;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new PendingReleaseRepository(db);
  });

  it("round-trips fields through insert + get, but drops additionalInfo/remoteBook (no backing column -- known C# quirk, see pendingRelease.ts)", () => {
    const inserted = repo.insert(makeRelease());
    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.authorId).toBe(1);
    expect(stored.title).toBe("Some Author - Some Book");
    expect(stored.reason).toBe(PendingReleaseReason.Delay);
    expect(stored.parsedBookInfo).toEqual({
      authorName: "Some Author",
      quality: {},
      discography: false,
    });
    expect((stored.release as { indexer: string }).indexer).toBe("MyIndexer");

    // Known quirk: additionalInfo has no DB column in the real schema either.
    expect(stored.additionalInfo).toBeNull();
    expect(stored.remoteBook).toBeNull();
  });

  it("find() returns undefined for a missing id", () => {
    expect(repo.find(999)).toBeUndefined();
  });

  it("get() throws for a missing id", () => {
    expect(() => repo.get(999)).toThrow();
  });

  it("update() persists changes to an existing row", () => {
    const inserted = repo.insert(makeRelease());
    repo.update({ ...inserted, reason: PendingReleaseReason.Fallback });
    expect(repo.get(inserted.id).reason).toBe(PendingReleaseReason.Fallback);
  });

  it("delete() removes the row (by id or model)", () => {
    const a = repo.insert(makeRelease());
    const b = repo.insert(makeRelease({ authorId: 2 }));

    repo.delete(a.id);
    expect(repo.find(a.id)).toBeUndefined();

    repo.delete(b);
    expect(repo.find(b.id)).toBeUndefined();
  });

  it("deleteMany() removes multiple rows and no-ops on an empty list", () => {
    const a = repo.insert(makeRelease());
    const b = repo.insert(makeRelease({ authorId: 2 }));

    repo.deleteMany([]);
    expect(repo.all()).toHaveLength(2);

    repo.deleteMany([a.id, b.id]);
    expect(repo.all()).toHaveLength(0);
  });

  it("allByAuthorId() filters by author", () => {
    repo.insert(makeRelease({ authorId: 1 }));
    repo.insert(makeRelease({ authorId: 2 }));

    expect(repo.allByAuthorId(1)).toHaveLength(1);
    expect(repo.allByAuthorId(1)[0]?.authorId).toBe(1);
  });

  it("deleteByAuthorId() removes only that author's rows", () => {
    repo.insert(makeRelease({ authorId: 1 }));
    repo.insert(makeRelease({ authorId: 2 }));

    repo.deleteByAuthorId(1);

    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]?.authorId).toBe(2);
  });

  it("withoutFallback() excludes Fallback-reason rows", () => {
    repo.insert(makeRelease({ reason: PendingReleaseReason.Delay }));
    repo.insert(makeRelease({ reason: PendingReleaseReason.Fallback }));
    repo.insert(makeRelease({ reason: PendingReleaseReason.DownloadClientUnavailable }));

    const results = repo.withoutFallback();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.reason !== PendingReleaseReason.Fallback)).toBe(true);
  });
});
