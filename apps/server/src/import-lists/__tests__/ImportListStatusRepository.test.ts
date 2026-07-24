import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { ImportListStatusRepository } from "../ImportListStatusRepository.js";
import { createImportListStatus } from "../ImportListStatus.js";

/**
 * Uses the real ported migrations (0001's ImportListStatus table + 0029's
 * LastSyncListInfo -> LastInfoSync rename) against an in-memory sqlite db,
 * proving this repository's column list matches the real migration history.
 */
function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

describe("ImportListStatusRepository", () => {
  it("inserts and round-trips a status row including LastInfoSync", () => {
    const db = makeDatabase();
    const repo = new ImportListStatusRepository(db);

    const inserted = repo.upsert(
      createImportListStatus({
        providerId: 7,
        escalationLevel: 2,
        disabledTill: "2026-01-01T00:00:00.000Z",
        lastInfoSync: "2025-12-31T00:00:00.000Z",
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const fetched = repo.findByProviderId(7);
    expect(fetched?.escalationLevel).toBe(2);
    expect(fetched?.disabledTill).toBe("2026-01-01T00:00:00.000Z");
    expect(fetched?.lastInfoSync).toBe("2025-12-31T00:00:00.000Z");
  });

  it("upsert on an existing id updates rather than inserts", () => {
    const db = makeDatabase();
    const repo = new ImportListStatusRepository(db);

    const inserted = repo.upsert(createImportListStatus({ providerId: 3 }));
    repo.upsert({ ...inserted, escalationLevel: 5 });

    expect(repo.all()).toHaveLength(1);
    expect(repo.findByProviderId(3)?.escalationLevel).toBe(5);
  });

  it("deleteByProviderId removes the matching row", () => {
    const db = makeDatabase();
    const repo = new ImportListStatusRepository(db);

    repo.upsert(createImportListStatus({ providerId: 9 }));
    repo.deleteByProviderId(9);

    expect(repo.findByProviderId(9)).toBeUndefined();
  });
});
