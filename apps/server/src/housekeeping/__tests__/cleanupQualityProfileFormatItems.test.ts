import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeEach } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { QualityProfileRepository } from "../../profiles/qualities/qualityProfileRepository.js";
import { newQualityProfile } from "../../profiles/qualities/qualityProfile.js";
import type { CustomFormat } from "../../custom-formats/customFormat.js";
import {
  CleanupQualityProfileFormatItems,
  type CustomFormatLookupForCleanup,
} from "../housekeepers/cleanupQualityProfileFormatItems.js";

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

function makeCustomFormat(id: number, name: string): CustomFormat {
  return { id, name, includeCustomFormatWhenRenaming: false, specifications: [] };
}

type StoredFormatItem =
  { format: { Id: number }; score: number } | { Format: { Id: number }; Score: number };

/**
 * Reads the raw "FormatItems"/"MinFormatScore"/"CutoffFormatScore" columns
 * directly via SQL, bypassing `QualityProfileRepository.hydrate()` (see
 * that file's doc comment) -- `hydrate()` re-filters every read's
 * `formatItems` against its own constructor-injected `customFormatLookup`,
 * which would otherwise mask whether `CleanupQualityProfileFormatItems`
 * itself wrote the right thing to the DB (a `repo.get()` after `clean()`
 * with a "no formats available" lookup would show an empty list either way,
 * regardless of whether the housekeeper's own dedup/add logic ran
 * correctly).
 */
function readRawProfile(db: IDatabase, id: number) {
  const row = db
    .openConnection()
    .prepare(
      'SELECT "FormatItems", "MinFormatScore", "CutoffFormatScore" FROM "QualityProfiles" WHERE "Id" = ?'
    )
    .get(id) as { FormatItems: string; MinFormatScore: number; CutoffFormatScore: number };

  return {
    formatItems: JSON.parse(row.FormatItems) as StoredFormatItem[],
    minFormatScore: row.MinFormatScore,
    cutoffFormatScore: row.CutoffFormatScore,
  };
}

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupQualityProfileFormatItems.cs. */
describe("CleanupQualityProfileFormatItems", () => {
  let db: IDatabase;

  beforeEach(() => {
    db = makeDatabase();
  });

  function lookup(formats: CustomFormat[]): CustomFormatLookupForCleanup {
    return { all: () => formats };
  }

  it("adds a FormatItem (score 0) for a CustomFormat the profile doesn't yet have", () => {
    const format = makeCustomFormat(1, "x264");
    const repo = new QualityProfileRepository(db, () => [format]);
    const profile = repo.insert(newQualityProfile({ name: "p1", cutoff: 1, items: [] }));

    new CleanupQualityProfileFormatItems(repo, lookup([format])).clean();

    const raw = readRawProfile(db, profile.id);
    expect(raw.formatItems).toHaveLength(1);
  });

  it("drops a FormatItem whose CustomFormat has been deleted", () => {
    const deletedFormat = makeCustomFormat(1, "gone");
    // repo's own customFormatLookup still knows about deletedFormat (so its
    // hydrate() doesn't strip it before the housekeeper's own dedup logic
    // gets a chance to run) -- the housekeeper is given a *separate*,
    // already-empty lookup below, matching "the format was deleted from the
    // CustomFormats table" (CleanupQualityProfileFormatItems's own view of
    // what's currently available) while the repository's read-path
    // hydration is a distinct, independent concern in this port (see
    // qualityProfileRepository.ts's doc comment).
    const repo = new QualityProfileRepository(db, () => [deletedFormat]);
    const profile = repo.insert(
      newQualityProfile({
        name: "p1",
        cutoff: 1,
        items: [],
        formatItems: [{ format: deletedFormat, score: 5 }],
      })
    );

    new CleanupQualityProfileFormatItems(repo, lookup([])).clean();

    const raw = readRawProfile(db, profile.id);
    expect(raw.formatItems).toHaveLength(0);
  });

  it("resets MinFormatScore/CutoffFormatScore to 0 when the profile's FormatItems end up empty", () => {
    const deletedFormat = makeCustomFormat(1, "gone");
    const repo = new QualityProfileRepository(db, () => [deletedFormat]);
    const profile = repo.insert(
      newQualityProfile({
        name: "p1",
        cutoff: 1,
        items: [],
        formatItems: [{ format: deletedFormat, score: 5 }],
        minFormatScore: 10,
        cutoffFormatScore: 20,
      })
    );

    new CleanupQualityProfileFormatItems(repo, lookup([])).clean();

    const raw = readRawProfile(db, profile.id);
    expect(raw.minFormatScore).toBe(0);
    expect(raw.cutoffFormatScore).toBe(0);
  });

  it("does not touch a profile whose format-id set is unchanged (update() is never called)", () => {
    const format = makeCustomFormat(1, "x264");
    const repo = new QualityProfileRepository(db, () => [format]);
    const profile = repo.insert(
      newQualityProfile({
        name: "p1",
        cutoff: 1,
        items: [],
        formatItems: [{ format, score: 7 }],
        minFormatScore: 3,
      })
    );

    new CleanupQualityProfileFormatItems(repo, lookup([format])).clean();

    const raw = readRawProfile(db, profile.id);
    expect(raw.formatItems).toHaveLength(1);
    expect(raw.minFormatScore).toBe(3);
  });

  it("reconciles multiple profiles independently in a single clean() call", () => {
    const format = makeCustomFormat(1, "x264");
    const repo = new QualityProfileRepository(db, () => [format]);
    const p1 = repo.insert(newQualityProfile({ name: "p1", cutoff: 1, items: [] }));
    const p2 = repo.insert(newQualityProfile({ name: "p2", cutoff: 1, items: [] }));

    new CleanupQualityProfileFormatItems(repo, lookup([format])).clean();

    expect(readRawProfile(db, p1.id).formatItems).toHaveLength(1);
    expect(readRawProfile(db, p2.id).formatItems).toHaveLength(1);
  });
});
