import { basename, join } from "node:path";
import type { IDatabase } from "../db/database.js";

export interface MakeDatabaseBackupLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: MakeDatabaseBackupLogger = { error: () => {} };

/**
 * Ported from NzbDrone.Core/Backup/MakeDatabaseBackup.cs.
 *
 * ## SQLite backup API
 *
 * C#'s `System.Data.SQLite`'s `SQLiteConnection.BackupDatabase(destination,
 * "main", "main", -1, null, 500)` performs an online SQLite backup using
 * SQLite's native backup API, copying `-1` (all) pages in batches with a
 * 500ms sleep between them, then forces the destination's journal mode
 * back to Truncate (the source may be running in WAL mode, and a
 * mid-backup page-size or journal-mode change would otherwise leak
 * through).
 *
 * `node:sqlite` also exports a standalone `backup(sourceDb, destinationPath,
 * options?)` function that wraps the same native SQLite backup API -- but it
 * was only added in Node 22.15.0, one point release after this project's
 * CI-pinned floor (22.14.0; confirmed the hard way -- an earlier version of
 * this file used it and passed locally on a newer Node before failing CI's
 * 22.14.0 leg with `TypeError: (0 , backup) is not a function`). Ported here
 * instead via SQLite's `VACUUM INTO 'path'` statement, run against the live
 * connection: a standard SQL feature of the SQLite library itself (not a
 * `node:sqlite` API surface), so it's available on any Node version this
 * project supports. It provides an equivalent guarantee to the C# original
 * -- safe to run against a live, open, WAL-mode connection, since `VACUUM
 * INTO` reads a transactionally-consistent snapshot -- and, as a bonus,
 * `VACUUM INTO`'s output is always a single, defragmented, rollback-journal
 * (not WAL) file with no `-wal`/`-shm` sidecar, which is exactly the
 * "Truncate mode, sidecars cleaned up" end state `BackupDatabase()` forces
 * via an explicit post-backup pragma in the C# original -- so no equivalent
 * pragma step is needed here.
 */
export interface IMakeDatabaseBackup {
  backupDatabase(database: IDatabase, targetDirectory: string, sourcePath: string): Promise<void>;
}

export class MakeDatabaseBackup implements IMakeDatabaseBackup {
  constructor(private readonly logger: MakeDatabaseBackupLogger = noopLogger) {}

  /**
   * `sourcePath` is passed explicitly (the filesystem path backing
   * `database`) since `node:sqlite`'s `DatabaseSync` -- unlike C#'s
   * `SQLiteConnection.ConnectionString` -- doesn't expose its own backing
   * file path for `Path.GetFileName()`-style derivation of the destination
   * filename; the caller (BackupService, which already opened the database
   * from a known path) supplies it.
   */
  async backupDatabase(
    database: IDatabase,
    targetDirectory: string,
    sourcePath: string
  ): Promise<void> {
    const destinationPath = join(targetDirectory, basename(sourcePath));

    try {
      // SQLite string literals escape a single quote by doubling it; the
      // destination is a filesystem path we control (derived from
      // targetDirectory/sourcePath, never user-supplied SQL), but this
      // guards against paths that legitimately contain an apostrophe.
      const escapedPath = destinationPath.replace(/'/g, "''");
      database.openConnection().exec(`VACUUM INTO '${escapedPath}'`);
    } catch (e) {
      this.logger.error("Failed to create database backup", e);
      throw e;
    }
  }
}
