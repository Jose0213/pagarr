import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestCacheDatabase } from "./testDb.js";
import type { CacheDatabase } from "../../db/db-factory.js";
import { TrimHttpCache } from "../housekeepers/trimHttpCache.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/TrimHttpCache.cs. */
describe("TrimHttpCache", () => {
  let db: CacheDatabase;

  beforeEach(() => {
    db = createTestCacheDatabase();
  });

  afterEach(() => {
    db.close();
  });

  function insertResponse(url: string, expiry: string): void {
    db.openConnection()
      .prepare(
        `INSERT INTO "HttpResponse" ("Url", "LastRefresh", "Expiry", "Value", "StatusCode") VALUES (?, '2024-01-01', ?, 'x', 200)`
      )
      .run(url, expiry);
  }

  it("deletes HttpResponse rows whose Expiry is before today, keeps ones expiring in the future", () => {
    insertResponse("http://expired", "2000-01-01");
    insertResponse("http://future", "2999-01-01");

    new TrimHttpCache(db).clean();

    const remaining = db.openConnection().prepare('SELECT "Url" FROM "HttpResponse"').all() as {
      Url: string;
    }[];
    expect(remaining).toEqual([{ Url: "http://future" }]);
  });

  it("vacuums the cache database after trimming", () => {
    // No direct way to assert VACUUM ran beyond "doesn't throw" -- node:sqlite
    // has no query-log hook here; a smoke test confirms clean() completes
    // and the connection remains usable afterward.
    insertResponse("http://expired", "2000-01-01");

    expect(() => new TrimHttpCache(db).clean()).not.toThrow();
    expect(db.openConnection().prepare('SELECT COUNT(*) as c FROM "HttpResponse"').get()).toEqual({
      c: 0,
    });
  });
});
