import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { QualityProfileRepository } from "../qualities/qualityProfileRepository.js";
import { newQualityProfile } from "../qualities/qualityProfile.js";
import { newQualityItem } from "../qualities/qualityProfileQualityItem.js";
import type { CustomFormat } from "../customFormat.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "QualityProfiles" (
      "Id" INTEGER PRIMARY KEY,
      "Name" TEXT NOT NULL UNIQUE,
      "Cutoff" INTEGER NOT NULL,
      "Items" TEXT NOT NULL,
      "UpgradeAllowed" INTEGER NULL,
      "FormatItems" TEXT NOT NULL DEFAULT '[]',
      "MinFormatScore" INTEGER NOT NULL DEFAULT 0,
      "CutoffFormatScore" INTEGER NOT NULL DEFAULT 0
    );
  `);
  return new Database("Test", sqlite);
}

/** Ported from NzbDrone.Core.Test/Profiles/ProfileRepositoryFixture.cs's "should_be_able_to_read_and_write". */
describe("QualityProfileRepository", () => {
  let db: IDatabase;
  let repo: QualityProfileRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new QualityProfileRepository(db);
  });

  it("round-trips name, cutoff, and items through insert + get", () => {
    const mp3 = { id: 10, name: "MP3" };
    const profile = newQualityProfile({
      name: "TestProfile",
      cutoff: mp3.id,
      items: [newQualityItem({ quality: mp3, allowed: true })],
    });

    const inserted = repo.insert(profile);
    const stored = repo.get(inserted.id);

    expect(stored.name).toBe("TestProfile");
    expect(stored.cutoff).toBe(mp3.id);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]?.quality).toEqual(mp3);
    expect(stored.items[0]?.allowed).toBe(true);
  });

  it("round-trips formatItems and boolean/number fields", () => {
    const format: CustomFormat = { id: 5, name: "Some Format" };
    // Query()'s re-hydration (see QualityProfileRepository's doc comment)
    // only keeps a FormatItem whose CustomFormat still exists per the
    // injected lookup -- so this repo instance needs the format registered
    // to prove round-tripping, distinct from the "prune" test below which
    // deliberately exercises the opposite path with an empty lookup.
    const hydratingRepo = new QualityProfileRepository(db, () => [format]);

    const profile = newQualityProfile({
      name: "WithFormats",
      cutoff: 0,
      items: [],
      upgradeAllowed: true,
      minFormatScore: 3,
      cutoffFormatScore: 20,
      formatItems: [{ format, score: 7 }],
    });

    const inserted = hydratingRepo.insert(profile);
    const stored = hydratingRepo.get(inserted.id);

    expect(stored.upgradeAllowed).toBe(true);
    expect(stored.minFormatScore).toBe(3);
    expect(stored.cutoffFormatScore).toBe(20);
    expect(stored.formatItems).toEqual([{ format, score: 7 }]);
  });

  it("drops FormatItems whose CustomFormat no longer exists, per QualityProfileRepository.Query()'s re-hydration", () => {
    const survivingFormat: CustomFormat = { id: 1, name: "Still Here" };
    const removedFormat: CustomFormat = { id: 2, name: "Removed" };

    const hydratingRepo = new QualityProfileRepository(db, () => [survivingFormat]);

    const inserted = hydratingRepo.insert(
      newQualityProfile({
        name: "Prune",
        formatItems: [
          { format: survivingFormat, score: 1 },
          { format: removedFormat, score: 2 },
        ],
      })
    );

    const stored = hydratingRepo.get(inserted.id);
    expect(stored.formatItems).toEqual([{ format: survivingFormat, score: 1 }]);
  });

  it("exists() returns true only for a stored id", () => {
    const inserted = repo.insert(newQualityProfile({ name: "Exists" }));
    expect(repo.exists(inserted.id)).toBe(true);
    expect(repo.exists(inserted.id + 999)).toBe(false);
  });

  it("update() persists changes and delete() removes the row", () => {
    const inserted = repo.insert(newQualityProfile({ name: "Original", cutoff: 1 }));

    repo.update({ ...inserted, name: "Renamed", cutoff: 2 });
    expect(repo.get(inserted.id).name).toBe("Renamed");
    expect(repo.get(inserted.id).cutoff).toBe(2);

    repo.delete(inserted.id);
    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("insert() throws for a non-zero id, matching BasicRepository's guard", () => {
    expect(() => repo.insert(newQualityProfile({ name: "Bad", ...{ id: 5 } }))).toThrow(/existing ID 5/);
  });
});
