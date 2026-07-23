import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { newMetadataProfile } from "../metadata/metadataProfile.js";
import { MetadataProfileRepository } from "../metadata/metadataProfileRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "MetadataProfiles" (
      "Id" INTEGER PRIMARY KEY,
      "Name" TEXT NOT NULL UNIQUE,
      "MinPopularity" REAL NOT NULL,
      "SkipMissingDate" INTEGER NOT NULL,
      "SkipMissingIsbn" INTEGER NOT NULL,
      "SkipPartsAndSets" INTEGER NOT NULL,
      "SkipSeriesSecondary" INTEGER NOT NULL,
      "AllowedLanguages" TEXT NULL,
      "MinPages" INTEGER NOT NULL DEFAULT 0,
      "Ignored" TEXT NULL
    );
  `);
  return new Database("Test", sqlite);
}

/** Ported from NzbDrone.Core.Test/Profiles/Metadata/MetadataProfileRepositoryFixture.cs (the C# test itself is a TODO stub, so this exercises the round-trip directly). */
describe("MetadataProfileRepository", () => {
  let db: IDatabase;
  let repo: MetadataProfileRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new MetadataProfileRepository(db);
  });

  it("round-trips all scalar fields plus the JSON-array Ignored column", () => {
    const inserted = repo.insert(
      newMetadataProfile({
        name: "Standard",
        minPopularity: 350,
        skipMissingDate: true,
        skipMissingIsbn: false,
        skipPartsAndSets: true,
        skipSeriesSecondary: false,
        allowedLanguages: "eng, null",
        minPages: 50,
        ignored: ["foo", "bar"],
      })
    );

    const stored = repo.get(inserted.id);

    expect(stored.name).toBe("Standard");
    expect(stored.minPopularity).toBe(350);
    expect(stored.skipMissingDate).toBe(true);
    expect(stored.skipMissingIsbn).toBe(false);
    expect(stored.skipPartsAndSets).toBe(true);
    expect(stored.skipSeriesSecondary).toBe(false);
    expect(stored.allowedLanguages).toBe("eng, null");
    expect(stored.minPages).toBe(50);
    expect(stored.ignored).toEqual(["foo", "bar"]);
  });

  it("treats a NULL Ignored column as an empty array", () => {
    const sqlite = db.openConnection();
    sqlite
      .prepare(
        'INSERT INTO "MetadataProfiles" ("Name", "MinPopularity", "SkipMissingDate", "SkipMissingIsbn", "SkipPartsAndSets", "SkipSeriesSecondary", "AllowedLanguages", "MinPages", "Ignored") VALUES (?, 0, 0, 0, 0, 0, NULL, 0, NULL)'
      )
      .run("Legacy");

    expect(repo.all()[0]!.ignored).toEqual([]);
  });

  it("exists() matches BasicRepository semantics", () => {
    const inserted = repo.insert(newMetadataProfile({ name: "Exists" }));
    expect(repo.exists(inserted.id)).toBe(true);
    expect(repo.exists(inserted.id + 999)).toBe(false);
  });
});
