import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { MakeDatabaseBackup } from "../makeDatabaseBackup.js";

describe("MakeDatabaseBackup", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: MainDatabase;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-backup-test-"));
    dbPath = join(tmpDir, "readarr.db");
    db = createMainDatabase(dbPath);
    db.openConnection().exec('CREATE TABLE "Probe" ("Id" INTEGER PRIMARY KEY, "Value" TEXT)');
    db.openConnection().prepare('INSERT INTO "Probe" ("Value") VALUES (?)').run("hello");
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies the live database to the target directory under the same filename", async () => {
    const targetDir = join(tmpDir, "backup-target");
    mkdirSync(targetDir);

    const makeDatabaseBackup = new MakeDatabaseBackup();
    await makeDatabaseBackup.backupDatabase(db, targetDir, dbPath);

    const backupPath = join(targetDir, "readarr.db");
    expect(existsSync(backupPath)).toBe(true);

    const check = new DatabaseSync(backupPath);
    try {
      const rows = check.prepare('SELECT * FROM "Probe"').all() as { Value: string }[];
      expect(rows).toEqual([{ Id: 1, Value: "hello" }]);
    } finally {
      check.close();
    }
  });

  it("does not leave a -wal/-shm sidecar next to the backup file", async () => {
    // Ported semantics note (see makeDatabaseBackup.ts's doc comment):
    // `journal_mode=TRUNCATE` (unlike WAL) is a per-connection PRAGMA, not
    // persisted in the database file itself -- a freshly-opened connection
    // to the backup file always reports SQLite's built-in default
    // ("delete"), the same way it would after C#'s SQLiteConnection that
    // forced Truncate mode is closed and a new one opened. What IS a real,
    // durably observable effect of forcing Truncate mode (then closing that
    // connection) is that no -wal/-shm sidecar is left behind -- verified
    // here instead of asserting a per-connection PRAGMA value that doesn't
    // survive a reconnect.
    const targetDir = join(tmpDir, "backup-target-2");
    mkdirSync(targetDir);

    const makeDatabaseBackup = new MakeDatabaseBackup();
    await makeDatabaseBackup.backupDatabase(db, targetDir, dbPath);

    const backupPath = join(targetDir, "readarr.db");
    expect(existsSync(backupPath)).toBe(true);
    expect(existsSync(`${backupPath}-wal`)).toBe(false);
    expect(existsSync(`${backupPath}-shm`)).toBe(false);
  });
});
