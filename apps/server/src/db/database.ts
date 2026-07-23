import { DatabaseSync } from "node:sqlite";

/**
 * Ported from NzbDrone.Core/Datastore/Database.cs
 *
 * C# supported both SQLite and PostgreSQL behind `IDatabase`/`DatabaseType`.
 * Pagarr targets SQLite only (see PORT_PLAN.md), so `DatabaseType` is kept
 * as a marker for API-shape fidelity with the original (some downstream
 * query-building code -- SqlBuilder/WhereBuilder -- still branches on it in
 * the C# source, and future modules ported from that code will expect the
 * enum to exist) but only the SQLite value is ever produced.
 */
export enum DatabaseType {
  SQLite = "SQLite",
}

export interface IDatabase {
  /** Returns the single shared `node:sqlite` connection for this logical database. */
  openConnection(): DatabaseSync;
  readonly databaseType: DatabaseType;
  /** SQLite engine version string, e.g. "3.45.1". Ported from IDatabase.Version. */
  version(): string;
  /** Highest applied migration version from the VersionInfo table. */
  migration(): number;
  vacuum(): void;
  /**
   * Closes the underlying `node:sqlite` handle. Not present in the C#
   * IDatabase interface (ADO.NET connections there are opened/closed
   * per-call via `using`); added here because `node:sqlite`'s DatabaseSync
   * is one long-lived handle per logical database (see this file's other
   * doc comment) and callers -- notably tests that create temp-file
   * databases -- need an explicit way to release the file handle before
   * cleanup, particularly on Windows where an open handle blocks deleting
   * the file/directory.
   */
  close(): void;
}

/**
 * Ported from NzbDrone.Core/Datastore/Database.cs's `Database` class.
 *
 * C#'s Database wrapped a `Func<IDbConnection>` factory and opened a new ADO.NET
 * connection per call (relying on SQLite connection pooling under the hood).
 * `node:sqlite`'s DatabaseSync is a single persistent handle, not a poolable
 * per-call connection -- so this wraps one already-open DatabaseSync instance
 * instead of a connection factory. `openConnection()` is kept as the method
 * name for shape-fidelity with call sites ported from BasicRepository.cs,
 * even though it doesn't open a new connection each time.
 */
export class Database implements IDatabase {
  private readonly db: DatabaseSync;
  private readonly name: string;

  constructor(name: string, db: DatabaseSync) {
    this.name = name;
    this.db = db;
  }

  openConnection(): DatabaseSync {
    return this.db;
  }

  get databaseType(): DatabaseType {
    return DatabaseType.SQLite;
  }

  version(): string {
    const row = this.db.prepare("SELECT sqlite_version() AS version").get() as
      { version: string } | undefined;
    return row?.version ?? "";
  }

  migration(): number {
    const row = this.db
      .prepare('SELECT "Version" as version from "VersionInfo" ORDER BY "Version" DESC LIMIT 1')
      .get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  vacuum(): void {
    try {
      this.db.exec("VACUUM;");
    } catch (e) {
      // Ported behavior: C# logs and swallows vacuum failures rather than
      // propagating them (Database.cs catches Exception around Vacuum()).

      console.error(`An error occurred while vacuuming ${this.name} database.`, e);
    }
  }

  close(): void {
    this.db.close();
  }
}
