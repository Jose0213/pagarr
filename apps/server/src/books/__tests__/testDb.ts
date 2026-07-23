/**
 * Shared test helper: an in-memory main database migrated with the real
 * ported migration history (so Books repository tests run against the
 * actual schema, including column names/types, not a hand-rolled fixture
 * table -- following db/db-factory.test.ts's pattern).
 */

import {
  createMainDatabase,
  DEFAULT_MAIN_MIGRATIONS_DIR,
  type MainDatabase,
} from "../../db/db-factory.js";

export function createTestDatabase(): MainDatabase {
  return createMainDatabase(":memory:", DEFAULT_MAIN_MIGRATIONS_DIR);
}
