import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Database, type IDatabase } from "./database.js";
import { migrate } from "./migration-runner.js";

/**
 * Ported from NzbDrone.Core/Datastore/MainDatabase.cs, LogDatabase.cs,
 * CacheDatabase.cs.
 *
 * These were three near-identical marker interfaces/classes in C#
 * (IMainDatabase/ILogDatabase/ICacheDatabase all just wrap IDatabase) used
 * purely so DI could inject "the main db" vs "the log db" vs "the cache db"
 * into different services without ambiguity. TypeScript has no DI
 * container in this port (PORT_PLAN.md: "plain constructor injection /
 * factory functions passed explicitly"), so the three are kept as thin
 * marker classes wrapping IDatabase, and callers just hold a reference to
 * the concrete one they need -- e.g. `new MainDatabase(db)` -- and pass it
 * down explicitly instead of resolving it from a container.
 */
export class MainDatabase implements IDatabase {
  constructor(private readonly inner: IDatabase) {}
  openConnection() {
    return this.inner.openConnection();
  }
  get databaseType() {
    return this.inner.databaseType;
  }
  version() {
    return this.inner.version();
  }
  migration() {
    return this.inner.migration();
  }
  vacuum() {
    this.inner.vacuum();
  }
  close() {
    this.inner.close();
  }
}

export class LogDatabase implements IDatabase {
  constructor(private readonly inner: IDatabase) {}
  openConnection() {
    return this.inner.openConnection();
  }
  get databaseType() {
    return this.inner.databaseType;
  }
  version() {
    return this.inner.version();
  }
  migration() {
    return this.inner.migration();
  }
  vacuum() {
    this.inner.vacuum();
  }
  close() {
    this.inner.close();
  }
}

export class CacheDatabase implements IDatabase {
  constructor(private readonly inner: IDatabase) {}
  openConnection() {
    return this.inner.openConnection();
  }
  get databaseType() {
    return this.inner.databaseType;
  }
  version() {
    return this.inner.version();
  }
  migration() {
    return this.inner.migration();
  }
  vacuum() {
    this.inner.vacuum();
  }
  close() {
    this.inner.close();
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default migrations dir: apps/server/src/db/migrations (main DB schema history). */
export const DEFAULT_MAIN_MIGRATIONS_DIR = join(__dirname, "migrations");

export interface CreateDatabaseOptions {
  /** ':memory:' for tests, or a filesystem path for a real db. */
  path: string;
  /** Directory of NNNN_description.sql migration files to apply. Pass null to skip migrations entirely (e.g. log/cache DBs that have no schema history ported yet). */
  migrationsDir?: string | null;
}

/**
 * Ported from NzbDrone.Core/Datastore/DbFactory.cs.
 *
 * C#'s DbFactory.Create(MigrationType) picked a connection string via
 * IConnectionStringFactory, ran FluentMigrator's IMigrationController.Migrate
 * against it, then returned a `Database` wrapping a connection-factory
 * delegate. This collapses that into one function per logical database:
 * open (or create) the sqlite file, run pending migrations against it, wrap
 * it in `Database`, and return that. The corrupt-database recovery paths in
 * DbFactory.CreateMain/CreateLog (delete -shm/-wal/-journal and retry) are
 * deferred -- see the module's final report for why.
 */
export function createDatabase(name: string, options: CreateDatabaseOptions): IDatabase {
  const sqlite = new DatabaseSync(options.path);

  // Pragmas mirroring ConnectionStringFactory.cs's SQLiteConnectionStringBuilder
  // (WAL journal mode, busy timeout) -- CacheSize/Pooling/DateTimeKind have no
  // direct node:sqlite equivalent and are omitted.
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA busy_timeout = 100;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  if (options.migrationsDir) {
    migrate(sqlite, options.migrationsDir);
  }

  return new Database(name, sqlite);
}

export function createMainDatabase(
  path: string,
  migrationsDir = DEFAULT_MAIN_MIGRATIONS_DIR
): MainDatabase {
  return new MainDatabase(createDatabase("Main", { path, migrationsDir }));
}

export function createLogDatabase(path: string, migrationsDir: string | null = null): LogDatabase {
  return new LogDatabase(createDatabase("Log", { path, migrationsDir }));
}

export function createCacheDatabase(
  path: string,
  migrationsDir: string | null = null
): CacheDatabase {
  return new CacheDatabase(createDatabase("Cache", { path, migrationsDir }));
}
