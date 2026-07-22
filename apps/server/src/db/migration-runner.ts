import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Ported from NzbDrone.Core/Datastore/Migration/Framework/MigrationController.cs +
 * NzbDroneSQLiteProcessor.cs.
 *
 * Readarr used FluentMigrator: C# migration classes decorated with
 * `[Migration(N)]`, run against a `VersionInfo` tracking table that
 * FluentMigrator manages automatically. TypeScript has no migration-runner
 * library dependency here (deliberately, per PORT_PLAN.md -- no ORM/engine
 * binary), so this is a small hand-written runner that:
 *
 *  - Reads `.sql` files from a migrations directory, ordered by their
 *    numeric filename prefix (0000, 0001, ...) -- mirroring the
 *    `[Migration(N)]` version ordering FluentMigrator used.
 *  - Tracks applied versions in a `VersionInfo` table with the same shape
 *    FluentMigrator creates (`Version`, `AppliedOn`, `Description`), since
 *    Database.migration() (ported from IDatabase.Migration) queries it.
 *  - Applies each not-yet-applied migration's SQL inside a transaction,
 *    then records the version -- matching FluentMigrator's per-migration
 *    transaction behavior for the SQLite processor.
 *
 * NOTE: FluentMigrator supported `[Maintenance(MigrationStage.BeforeAll)]`
 * for out-of-band work (see 000_database_engine_version_check.cs, which
 * only logs the SQLite version and has no schema effect). That migration
 * has no faithful SQL translation -- it's a logging no-op -- so it's
 * represented here as migration 0000 with an empty/no-op SQL body for
 * numbering fidelity, and the runner just logs the engine version directly.
 */

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
}

const MIGRATION_FILENAME_RE = /^(\d{4})_(.+)\.sql$/;

export function loadMigrations(migrationsDir: string): MigrationFile[] {
  const entries = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  const migrations: MigrationFile[] = entries.map((filename) => {
    const match = MIGRATION_FILENAME_RE.exec(filename);
    if (!match) {
      throw new Error(
        `Migration filename "${filename}" does not match the required NNNN_description.sql pattern`
      );
    }

    const [, versionStr, name] = match;
    const version = Number.parseInt(versionStr!, 10);
    const sql = readFileSync(join(migrationsDir, filename), "utf8");

    return { version, name: name!, sql };
  });

  migrations.sort((a, b) => a.version - b.version);

  // Guard against accidental gaps/dupes silently reordering intent.
  migrations.forEach((m, i) => {
    if (i > 0 && m.version === migrations[i - 1]!.version) {
      throw new Error(`Duplicate migration version ${m.version} (${m.name})`);
    }
  });

  return migrations;
}

function ensureVersionInfoTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "VersionInfo" (
      "Version" INTEGER NOT NULL PRIMARY KEY,
      "AppliedOn" TEXT NULL,
      "Description" TEXT NULL
    );
  `);
}

function getAppliedVersions(db: DatabaseSync): Set<number> {
  const rows = db.prepare('SELECT "Version" as version FROM "VersionInfo"').all() as Array<{
    version: number;
  }>;
  return new Set(rows.map((r) => r.version));
}

/**
 * Applies all pending migrations from `migrationsDir` to `db`, in ascending
 * version order, each inside its own transaction. Ported behavior from
 * IMigrationRunner.MigrateUp(): idempotent re-runs are safe (already-applied
 * versions are skipped), and the runner throws (aborting the whole batch) on
 * the first migration that fails to apply, exactly like FluentMigrator does.
 */
export function migrate(db: DatabaseSync, migrationsDir: string): void {
  ensureVersionInfoTable(db);

  const migrations = loadMigrations(migrationsDir);
  const applied = getAppliedVersions(db);

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    db.exec("BEGIN");
    try {
      if (migration.sql.trim().length > 0) {
        db.exec(migration.sql);
      }

      db.prepare(
        'INSERT INTO "VersionInfo" ("Version", "AppliedOn", "Description") VALUES (?, ?, ?)'
      ).run(migration.version, new Date().toISOString(), migration.name);

      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.version}_${migration.name} failed: ${(e as Error).message}`,
        { cause: e }
      );
    }
  }
}
