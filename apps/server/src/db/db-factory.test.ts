import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMainDatabase,
  createLogDatabase,
  createCacheDatabase,
  DEFAULT_MAIN_MIGRATIONS_DIR,
  DEFAULT_LOG_MIGRATIONS_DIR,
  type MainDatabase,
  type LogDatabase,
  type CacheDatabase,
} from "./db-factory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_MIGRATIONS_DIR = join(__dirname, "migrations-log");
const CACHE_MIGRATIONS_DIR = join(__dirname, "migrations-cache");

describe("db-factory", () => {
  let tmpDir: string;
  let opened: Array<MainDatabase | LogDatabase | CacheDatabase>;

  afterEach(() => {
    // node:sqlite's DatabaseSync holds an OS file handle for as long as it's
    // open; on Windows that handle blocks deleting the temp directory, so
    // every database opened by a test must be closed before cleanup (see
    // database.ts's close() doc comment for why this method exists at all
    // despite having no C# IDatabase equivalent).
    for (const db of opened ?? []) {
      db.close();
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates a main database on disk, migrated and queryable", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-datastore-test-"));
    const dbPath = join(tmpDir, "pagarr-main.db");

    const main = createMainDatabase(dbPath, DEFAULT_MAIN_MIGRATIONS_DIR);
    opened = [main];

    expect(main.migration()).toBe(40);
    expect(main.version()).toMatch(/^\d+\.\d+\.\d+/);

    const conn = main.openConnection();
    conn.prepare('INSERT INTO "Tags" ("Label") VALUES (?)').run("test-tag");
    const row = conn.prepare('SELECT * FROM "Tags"').get() as { Label: string };
    expect(row.Label).toBe("test-tag");
  });

  it("creates independent log and cache databases", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-datastore-test-"));
    const logPath = join(tmpDir, "pagarr-log.db");
    const cachePath = join(tmpDir, "pagarr-cache.db");

    const logDb = createLogDatabase(logPath, LOG_MIGRATIONS_DIR);
    const cacheDb = createCacheDatabase(cachePath, CACHE_MIGRATIONS_DIR);
    opened = [logDb, cacheDb];

    logDb
      .openConnection()
      .prepare('INSERT INTO "Logs" ("Message", "Time", "Logger", "Level") VALUES (?, ?, ?, ?)')
      .run("hello", new Date().toISOString(), "TestLogger", "Info");

    cacheDb
      .openConnection()
      .prepare(
        'INSERT INTO "HttpResponse" ("Url", "LastRefresh", "Expiry", "Value", "StatusCode") VALUES (?, ?, ?, ?, ?)'
      )
      .run("https://example.com", new Date().toISOString(), new Date().toISOString(), "{}", 200);

    const logRow = logDb.openConnection().prepare('SELECT * FROM "Logs"').get() as {
      Message: string;
    };
    const cacheRow = cacheDb.openConnection().prepare('SELECT * FROM "HttpResponse"').get() as {
      Url: string;
    };

    expect(logRow.Message).toBe("hello");
    expect(cacheRow.Url).toBe("https://example.com");
  });

  it("persists data across separate connections to the same file path", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-datastore-test-"));
    const dbPath = join(tmpDir, "pagarr-persist.db");

    const first = createMainDatabase(dbPath, DEFAULT_MAIN_MIGRATIONS_DIR);
    first.openConnection().prepare('INSERT INTO "Tags" ("Label") VALUES (?)').run("persisted");
    first.close();

    const second = createMainDatabase(dbPath, DEFAULT_MAIN_MIGRATIONS_DIR);
    opened = [second];
    const row = second.openConnection().prepare('SELECT * FROM "Tags"').get() as { Label: string };

    expect(row.Label).toBe("persisted");
    // Migrations should be a no-op the second time (already at version 40).
    expect(second.migration()).toBe(40);
  });

  it("createLogDatabase() defaults to running the real log-db migrations (Logs table) without an explicit migrationsDir", () => {
    // Added alongside the Instrumentation module port: createLogDatabase's
    // migrationsDir default changed from `null` (skip migrations) to
    // DEFAULT_LOG_MIGRATIONS_DIR, since that module is the first real
    // caller of the log database. See db-factory.ts's doc comment on
    // DEFAULT_LOG_MIGRATIONS_DIR.
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-datastore-test-"));
    const logPath = join(tmpDir, "pagarr-log-default.db");

    const logDb = createLogDatabase(logPath);
    opened = [logDb];

    expect(logDb.migration()).toBeGreaterThan(0);

    logDb
      .openConnection()
      .prepare('INSERT INTO "Logs" ("Message", "Time", "Logger", "Level") VALUES (?, ?, ?, ?)')
      .run("hello", new Date().toISOString(), "TestLogger", "Info");

    const row = logDb.openConnection().prepare('SELECT * FROM "Logs"').get() as { Message: string };
    expect(row.Message).toBe("hello");
  });

  it("DEFAULT_LOG_MIGRATIONS_DIR points at the same migrations-log directory the earlier tests hardcode", () => {
    opened = [];
    expect(DEFAULT_LOG_MIGRATIONS_DIR).toBe(LOG_MIGRATIONS_DIR);
  });
});
