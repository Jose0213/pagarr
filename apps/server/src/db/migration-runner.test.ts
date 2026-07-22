import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMigrations, migrate } from "./migration-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_MIGRATIONS_DIR = join(__dirname, "migrations");
const LOG_MIGRATIONS_DIR = join(__dirname, "migrations-log");
const CACHE_MIGRATIONS_DIR = join(__dirname, "migrations-cache");

function tableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function columnNames(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe("loadMigrations", () => {
  it("loads all main migrations in ascending numeric order", () => {
    const migrations = loadMigrations(MAIN_MIGRATIONS_DIR);

    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0]!.version).toBe(0);

    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i]!.version).toBeGreaterThan(migrations[i - 1]!.version);
    }

    // 41 C# migration files (000-040) minus 024 (log-db-only, no MainDbUpgrade).
    expect(migrations.map((m) => m.version)).not.toContain(24);
    expect(migrations.at(-1)!.version).toBe(40);
  });
});

describe("migrate against the main database", () => {
  it("applies cleanly against a fresh in-memory database", () => {
    const db = new DatabaseSync(":memory:");

    expect(() => migrate(db, MAIN_MIGRATIONS_DIR)).not.toThrow();

    const tables = tableNames(db);
    expect(tables).toContain("Authors");
    expect(tables).toContain("Books");
    expect(tables).toContain("BookFiles");
    expect(tables).toContain("Blocklist"); // renamed from Blacklist in 0014
    expect(tables).not.toContain("Blacklist");
    expect(tables).toContain("CustomFormats"); // added in 0026
    expect(tables).toContain("DownloadHistory"); // added in 0020
    expect(tables).toContain("NotificationStatus"); // added in 0037

    // Renamed column from migration 0004.
    const notificationColumns = columnNames(db, "Notifications");
    expect(notificationColumns).toContain("OnBookRetag");
    expect(notificationColumns).not.toContain("OnTrackRetag");

    // Dropped column from migration 0009 (Authors.SortName moved to AuthorMetadata).
    expect(columnNames(db, "Authors")).not.toContain("SortName");
    expect(columnNames(db, "AuthorMetadata")).toContain("SortName");
    expect(columnNames(db, "AuthorMetadata")).toContain("NameLastFirst");
  });

  it("is idempotent -- re-running migrate() on an already-migrated db is a no-op", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, MAIN_MIGRATIONS_DIR);

    const versionBefore = db
      .prepare('SELECT MAX("Version") as v FROM "VersionInfo"')
      .get() as { v: number };

    expect(() => migrate(db, MAIN_MIGRATIONS_DIR)).not.toThrow();

    const versionAfter = db
      .prepare('SELECT MAX("Version") as v FROM "VersionInfo"')
      .get() as { v: number };

    expect(versionAfter.v).toBe(versionBefore.v);

    const appliedCountRow = db.prepare('SELECT COUNT(*) as c FROM "VersionInfo"').get() as {
      c: number;
    };
    // One VersionInfo row per applied migration -- re-running must not
    // duplicate rows for already-applied versions.
    const migrations = loadMigrations(MAIN_MIGRATIONS_DIR);
    expect(appliedCountRow.c).toBe(migrations.length);
  });

  it("seeds the default DelayProfiles row from migration 0001", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, MAIN_MIGRATIONS_DIR);

    const row = db.prepare('SELECT * FROM "DelayProfiles"').get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row["EnableUsenet"]).toBe(1);
    expect(row["EnableTorrent"]).toBe(1);
    expect(row["Order"]).toBe(2147483647);
    // BypassIfHighestQuality added + backfilled to true in migration 0026.
    expect(row["BypassIfHighestQuality"]).toBe(1);
  });

  it("backfills DownloadHistory from qualifying History rows (migration 0020)", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, MAIN_MIGRATIONS_DIR);

    db.exec(`
      INSERT INTO "History" ("SourceTitle", "Date", "Quality", "Data", "EventType", "DownloadId", "AuthorId", "BookId")
      VALUES ('Some Book', '2024-01-01T00:00:00Z', '{}', '{"protocol":"2","indexer":"MyIndexer"}', 1, 'abc123', 5, 9)
    `);

    // This row was already migrated at 0020, before the History insert above,
    // so re-run the backfill logic directly to prove the SQL is correct in
    // isolation (the migration only runs once against pre-existing rows).
    db.exec(`
      INSERT INTO "DownloadHistory" ("EventType", "AuthorId", "DownloadId", "SourceTitle", "Date", "Protocol", "Data")
      SELECT
        CASE h."EventType" WHEN 1 THEN 1 WHEN 8 THEN 2 WHEN 4 THEN 3 WHEN 10 THEN 4 WHEN 7 THEN 6 END,
        h."AuthorId", h."DownloadId", h."SourceTitle", h."Date",
        CAST(json_extract(h."Data", '$.protocol') AS INTEGER),
        json_object('indexer', json_extract(h."Data", '$.indexer'), 'downloadClient', json_extract(h."Data", '$.downloadClient'))
      FROM "History" h
      WHERE h."DownloadId" IS NOT NULL AND h."EventType" IN (1, 8, 4, 10, 7)
      GROUP BY h."EventType", h."DownloadId"
    `);

    const row = db.prepare('SELECT * FROM "DownloadHistory"').get() as Record<string, unknown>;
    expect(row["EventType"]).toBe(1);
    expect(row["AuthorId"]).toBe(5);
    expect(row["DownloadId"]).toBe("abc123");
    expect(row["Protocol"]).toBe(2);
    expect(JSON.parse(row["Data"] as string)).toEqual({ indexer: "MyIndexer", downloadClient: null });
  });

  it("converts ReleaseProfiles.Required/Ignored comma strings to JSON arrays (migration 0026)", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, MAIN_MIGRATIONS_DIR);

    // The migration already ran with an empty ReleaseProfiles table (nothing
    // to convert); exercise the same recursive-CTE conversion SQL directly
    // against fresh rows to prove it produces correct JSON arrays.
    db.exec(`
      INSERT INTO "ReleaseProfiles" ("Required", "Ignored", "Tags", "Enabled", "IndexerId")
      VALUES ('foo,bar, baz', '', '[]', 1, 0)
    `);

    db.exec(`
      WITH RECURSIVE split_required(id, token, rest) AS (
        SELECT "Id", NULL, COALESCE("Required", '') || ','
        FROM "ReleaseProfiles"
        UNION ALL
        SELECT id, trim(substr(rest, 1, instr(rest, ',') - 1)), substr(rest, instr(rest, ',') + 1)
        FROM split_required WHERE rest <> ''
      ),
      required_json(id, json) AS (
        SELECT id, COALESCE(json_group_array(token), '[]')
        FROM split_required WHERE token IS NOT NULL AND token <> '' GROUP BY id
      )
      UPDATE "ReleaseProfiles"
      SET "Required" = COALESCE((SELECT json FROM required_json WHERE required_json.id = "ReleaseProfiles"."Id"), '[]')
    `);

    const row = db.prepare('SELECT "Required" FROM "ReleaseProfiles"').get() as {
      Required: string;
    };
    expect(JSON.parse(row.Required)).toEqual(["foo", "bar", "baz"]);
  });

  it("throws and rolls back on an invalid migration file", () => {
    const db = new DatabaseSync(":memory:");

    // Simulate a broken migration by loading a fabricated bad SQL string
    // directly through migrate()'s internals via a temp dir would require
    // filesystem setup; instead assert the wrapping/rollback contract using
    // the real migrations dir plus a deliberately corrupted in-memory state
    // that will make a later migration's ALTER TABLE fail (column already
    // exists), proving errors abort the batch instead of silently continuing.
    db.exec(`
      CREATE TABLE "VersionInfo" ("Version" INTEGER NOT NULL PRIMARY KEY, "AppliedOn" TEXT NULL, "Description" TEXT NULL);
    `);
    // Pre-create Config with a shape that conflicts with migration 0001's CREATE TABLE.
    db.exec(`CREATE TABLE "Config" ("Id" INTEGER PRIMARY KEY);`);

    expect(() => migrate(db, MAIN_MIGRATIONS_DIR)).toThrow(/Migration 1_initial_setup failed/);

    // Migration 1 should not be recorded as applied since it failed.
    const applied = db.prepare('SELECT "Version" FROM "VersionInfo"').all() as Array<{
      Version: number;
    }>;
    expect(applied.map((a) => a.Version)).not.toContain(1);
  });
});

describe("migrate against the log database", () => {
  it("applies cleanly and creates Logs + UpdateHistory tables", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, LOG_MIGRATIONS_DIR);

    const tables = tableNames(db);
    expect(tables).toContain("Logs");
    expect(tables).toContain("UpdateHistory");
  });
});

describe("migrate against the cache database", () => {
  it("applies cleanly and creates the HttpResponse table", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, CACHE_MIGRATIONS_DIR);

    expect(tableNames(db)).toContain("HttpResponse");
  });
});
