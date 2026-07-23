/**
 * Shared test helper: an in-memory main database migrated with the real
 * ported migration history (so Housekeeping tests run against the actual
 * schema, including column names/types, not a hand-rolled fixture table --
 * following books/__tests__/testDb.ts's established pattern).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createMainDatabase,
  createCacheDatabase,
  DEFAULT_MAIN_MIGRATIONS_DIR,
  DEFAULT_LOG_MIGRATIONS_DIR,
  type MainDatabase,
  type CacheDatabase,
} from "../../db/db-factory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * `db/db-factory.ts`'s `createCacheDatabase()` defaults `migrationsDir` to
 * `null` (its own doc comment: "nothing needed the Logs/HttpResponse table
 * yet" was true when that default was written) -- `TrimHttpCache` is the
 * first caller in this port that actually needs the cache DB's real
 * "HttpResponse" table, so this test helper points explicitly at
 * `db/migrations-cache/` rather than relying on that stale default.
 */
const CACHE_MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations-cache");

export function createTestDatabase(): MainDatabase {
  return createMainDatabase(":memory:", DEFAULT_MAIN_MIGRATIONS_DIR);
}

export function createTestCacheDatabase(): CacheDatabase {
  return createCacheDatabase(":memory:", CACHE_MIGRATIONS_DIR);
}

export { DEFAULT_LOG_MIGRATIONS_DIR };
