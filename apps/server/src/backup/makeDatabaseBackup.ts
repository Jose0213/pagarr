import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { basename, join } from "node:path";
import { unlinkSync } from "node:fs";
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
 * through). `node:sqlite` exports the same native SQLite backup API
 * directly as a standalone async `backup(sourceDb, destinationPath,
 * options?)` function (confirmed against a real Node v24 `node:sqlite`
 * import: returns `Promise<number>`, the total page count copied) --
 * ported here as a direct, faithful equivalent rather than a manual
 * file-copy, since it provides the same "safe to run against a live,
 * open, WAL-mode connection" guarantee the C# original relies on
 * (`BackupDatabase` is called while the app's own live connection to the
 * main DB is still open).
 *
 * `SQLiteJournalModeEnum.Truncate` / the post-backup `PRAGMA
 * journal_mode=truncate` forcing step, and `SQLiteConnection.ClearAllPools()`
 * (ADO.NET connection-pool cleanup -- `node:sqlite` has no connection pool
 * to clear) are ported as a single `PRAGMA journal_mode=TRUNCATE;` executed
 * against the freshly-written backup file after `backup()` resolves, opened
 * as its own short-lived `DatabaseSync` purely to run that one pragma and
 * close again. NOTE: unlike `journal_mode=WAL`, `TRUNCATE`/`DELETE`/
 * `PERSIST` journal modes are NOT persisted in the SQLite file itself --
 * they're a per-connection runtime setting (confirmed against a real
 * `node:sqlite` round-trip: a freshly re-opened connection to the same file
 * reports SQLite's built-in default, "delete", regardless of what a prior
 * connection set). This matches the C# original's own actual observable
 * behavior exactly -- `BackupDatabase()` forces Truncate mode on the same
 * `backupConnection` it just wrote to, then closes it without ever
 * verifying the setting survived a reconnect either; the pragma's real,
 * durable effect here (as in the C# original) is ensuring the backup
 * process's -wal/-shm sidecars get checkpointed and cleaned up before the
 * connection closes, not that some persistent "Truncate mode" flag lives on
 * in the file.
 *
 * `-shm`/`-wal` sidecar files: unlike C#'s ADO.NET backup (which only ever
 * produces the single `.db` file at `backupConnectionStringBuilder.
 * DataSource`), `node:sqlite`'s native backup can leave a `-wal`/`-shm`
 * sidecar next to the destination if the backup was interrupted mid-page or
 * the destination's own journal mode defaults to WAL before the
 * `journal_mode=TRUNCATE` pragma runs. These are deleted (best-effort) after
 * forcing Truncate mode, so the emitted backup is always the single
 * self-contained `.db` file the original's comment ("This should also
 * automatically deal with the -journal and -wal files during restore")
 * describes BackupService.cs's caller as relying on.
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

    await sqliteBackup(database.openConnection(), destinationPath);

    this.forceTruncateJournalMode(destinationPath);
  }

  private forceTruncateJournalMode(destinationPath: string): void {
    try {
      // Short-lived connection opened solely to run one pragma.
      const conn = new DatabaseSync(destinationPath);
      try {
        conn.exec("PRAGMA journal_mode=TRUNCATE");
      } finally {
        conn.close();
      }

      for (const suffix of ["-wal", "-shm"]) {
        try {
          unlinkSync(destinationPath + suffix);
        } catch {
          // Sidecar file didn't exist -- nothing to clean up.
        }
      }
    } catch (e) {
      this.logger.error("Failed to force Truncate journal mode on backup file", e);
    }
  }
}
