import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { DownloadProtocol, newDelayProfile } from "../delay/delayProfile.js";
import { DelayProfileRepository } from "../delay/delayProfileRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "DelayProfiles" (
      "Id" INTEGER PRIMARY KEY,
      "EnableUsenet" INTEGER NOT NULL,
      "EnableTorrent" INTEGER NOT NULL,
      "PreferredProtocol" INTEGER NOT NULL,
      "UsenetDelay" INTEGER NOT NULL,
      "TorrentDelay" INTEGER NOT NULL,
      "Order" INTEGER NOT NULL,
      "Tags" TEXT NOT NULL,
      "BypassIfHighestQuality" INTEGER NOT NULL DEFAULT 0,
      "BypassIfAboveCustomFormatScore" INTEGER NOT NULL DEFAULT 0,
      "MinimumCustomFormatScore" INTEGER NULL
    );
  `);
  return new Database("Test", sqlite);
}

describe("DelayProfileRepository", () => {
  let db: IDatabase;
  let repo: DelayProfileRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new DelayProfileRepository(db);
  });

  it("round-trips tags as a JSON-serialized Set<number>", () => {
    const inserted = repo.insert(
      newDelayProfile({
        enableUsenet: true,
        enableTorrent: false,
        preferredProtocol: DownloadProtocol.Usenet,
        usenetDelay: 15,
        torrentDelay: 0,
        order: 1,
        tags: new Set([1, 2, 3]),
        bypassIfHighestQuality: true,
        bypassIfAboveCustomFormatScore: true,
        minimumCustomFormatScore: 42,
      })
    );

    const stored = repo.get(inserted.id);

    expect(stored.tags).toEqual(new Set([1, 2, 3]));
    expect(stored.enableUsenet).toBe(true);
    expect(stored.enableTorrent).toBe(false);
    expect(stored.preferredProtocol).toBe(DownloadProtocol.Usenet);
    expect(stored.bypassIfHighestQuality).toBe(true);
    expect(stored.bypassIfAboveCustomFormatScore).toBe(true);
    expect(stored.minimumCustomFormatScore).toBe(42);
  });

  it("round-trips a null MinimumCustomFormatScore", () => {
    const inserted = repo.insert(newDelayProfile({ minimumCustomFormatScore: null }));
    expect(repo.get(inserted.id).minimumCustomFormatScore).toBeNull();
  });

  it("updateMany updates every model transactionally", () => {
    const a = repo.insert(newDelayProfile({ order: 1 }));
    const b = repo.insert(newDelayProfile({ order: 2 }));

    repo.updateMany([
      { ...a, order: 10 },
      { ...b, order: 20 },
    ]);

    expect(repo.get(a.id).order).toBe(10);
    expect(repo.get(b.id).order).toBe(20);
  });
});
