import { describe, expect, it } from "vitest";
import {
  createLogDatabase,
  DEFAULT_LOG_MIGRATIONS_DIR,
  type LogDatabase,
} from "../../db/db-factory.js";
import { LogRepository } from "../logRepository.js";
import type { Log } from "../log.js";

/**
 * Uses the real ported log-db migrations (migrations-log/0001_initial_setup.sql's
 * "Logs" table) against an in-memory sqlite db, matching the convention set
 * by root-folders/root-folder-repository.test.ts.
 */
function makeDatabase(): LogDatabase {
  return createLogDatabase(":memory:", DEFAULT_LOG_MIGRATIONS_DIR);
}

function baseLog(overrides: Partial<Log> = {}): Log {
  return {
    id: 0,
    message: "hello world",
    time: new Date().toISOString(),
    logger: "TestLogger",
    exception: null,
    exceptionType: null,
    level: "Info",
    ...overrides,
  };
}

describe("LogRepository", () => {
  it("inserts and round-trips a log entry", () => {
    const db = makeDatabase();
    const repo = new LogRepository(db);

    const inserted = repo.insert(baseLog());

    expect(inserted.id).toBeGreaterThan(0);
    const fetched = repo.get(inserted.id);
    expect(fetched.message).toBe("hello world");
    expect(fetched.logger).toBe("TestLogger");
    expect(fetched.level).toBe("Info");
    expect(fetched.exception).toBeNull();
    expect(fetched.exceptionType).toBeNull();
  });

  it("round-trips exception fields when present", () => {
    const db = makeDatabase();
    const repo = new LogRepository(db);

    const inserted = repo.insert(
      baseLog({
        message: "boom: Fake Exception",
        level: "Error",
        exception: "System.InvalidOperationException: Fake Exception",
        exceptionType: "System.InvalidOperationException",
      })
    );

    const fetched = repo.get(inserted.id);
    expect(fetched.exception).toBe("System.InvalidOperationException: Fake Exception");
    expect(fetched.exceptionType).toBe("System.InvalidOperationException");
  });

  it("all() returns every inserted log row", () => {
    const db = makeDatabase();
    const repo = new LogRepository(db);

    repo.insert(baseLog({ message: "first" }));
    repo.insert(baseLog({ message: "second" }));

    expect(repo.all()).toHaveLength(2);
  });

  describe("trim", () => {
    it("deletes rows at or before 7 days ago (UTC, date-truncated) and keeps newer rows", () => {
      const db = makeDatabase();
      const repo = new LogRepository(db);

      const eightDaysAgo = new Date();
      eightDaysAgo.setUTCDate(eightDaysAgo.getUTCDate() - 8);

      const now = new Date();

      const old = repo.insert(baseLog({ message: "old", time: eightDaysAgo.toISOString() }));
      const recent = repo.insert(baseLog({ message: "recent", time: now.toISOString() }));

      repo.trim();

      expect(repo.find(old.id)).toBeUndefined();
      expect(repo.find(recent.id)).toBeDefined();
    });

    it("keeps a row exactly at the 7-day boundary if its time is after midnight of that day", () => {
      const db = makeDatabase();
      const repo = new LogRepository(db);

      // Ported semantics: trimDate = UtcNow.AddDays(-7).Date (midnight UTC of
      // 7 days ago). Anything strictly after that midnight survives; anything
      // at-or-before it is deleted ("Time <= trimDate").
      const sevenDaysAgoAtNoon = new Date();
      sevenDaysAgoAtNoon.setUTCDate(sevenDaysAgoAtNoon.getUTCDate() - 7);
      sevenDaysAgoAtNoon.setUTCHours(12, 0, 0, 0);

      const inserted = repo.insert(baseLog({ time: sevenDaysAgoAtNoon.toISOString() }));

      repo.trim();

      expect(repo.find(inserted.id)).toBeDefined();
    });

    it("is safe to call with no rows", () => {
      const db = makeDatabase();
      const repo = new LogRepository(db);

      expect(() => repo.trim()).not.toThrow();
    });
  });

  it("purge(vacuum) removes every row, used by LogService's ClearLogCommand handler", () => {
    const db = makeDatabase();
    const repo = new LogRepository(db);

    repo.insert(baseLog());
    repo.insert(baseLog());

    repo.purge(true);

    expect(repo.all()).toHaveLength(0);
  });
});
