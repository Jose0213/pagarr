import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { newReleaseProfile } from "../releases/releaseProfile.js";
import { ReleaseProfileRepository } from "../releases/releaseProfileRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "ReleaseProfiles" (
      "Id" INTEGER PRIMARY KEY,
      "Required" TEXT NULL,
      "Ignored" TEXT NULL,
      "Tags" TEXT NOT NULL,
      "Enabled" INTEGER NOT NULL DEFAULT 1,
      "IndexerId" INTEGER NOT NULL DEFAULT 0
    );
  `);
  return new Database("Test", sqlite);
}

describe("ReleaseProfileRepository", () => {
  let db: IDatabase;
  let repo: ReleaseProfileRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new ReleaseProfileRepository(db);
  });

  it("round-trips required/ignored term lists and tags", () => {
    const inserted = repo.insert(
      newReleaseProfile({
        required: ["foo", "/bar\\d+/i"],
        ignored: ["baz"],
        tags: new Set([1, 2]),
        enabled: false,
        indexerId: 3,
      })
    );

    const stored = repo.get(inserted.id);
    expect(stored.required).toEqual(["foo", "/bar\\d+/i"]);
    expect(stored.ignored).toEqual(["baz"]);
    expect(stored.tags).toEqual(new Set([1, 2]));
    expect(stored.enabled).toBe(false);
    expect(stored.indexerId).toBe(3);
  });

  it("defaults Required/Ignored to empty arrays when the DB column is NULL", () => {
    const sqlite = db.openConnection();
    sqlite
      .prepare('INSERT INTO "ReleaseProfiles" ("Required", "Ignored", "Tags", "Enabled", "IndexerId") VALUES (NULL, NULL, ?, 1, 0)')
      .run("[]");

    const stored = repo.all()[0]!;
    expect(stored.required).toEqual([]);
    expect(stored.ignored).toEqual([]);
  });

  it("update() and delete() behave as expected", () => {
    const inserted = repo.insert(newReleaseProfile({ required: ["a"] }));
    repo.update({ ...inserted, required: ["b"] });
    expect(repo.get(inserted.id).required).toEqual(["b"]);

    repo.delete(inserted.id);
    expect(repo.find(inserted.id)).toBeUndefined();
  });
});
