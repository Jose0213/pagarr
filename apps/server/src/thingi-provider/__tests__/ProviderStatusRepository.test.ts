import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createProviderStatusBase, type ProviderStatusBase } from "../status/ProviderStatusBase.js";
import { ProviderStatusRepository } from "../status/ProviderStatusRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "MockProviderStatus" (
      "Id" INTEGER PRIMARY KEY,
      "ProviderId" INTEGER NOT NULL UNIQUE,
      "InitialFailure" TEXT NULL,
      "MostRecentFailure" TEXT NULL,
      "EscalationLevel" INTEGER NOT NULL,
      "DisabledTill" TEXT NULL
    );
  `);
  return new Database("Test", sqlite);
}

describe("ProviderStatusRepository", () => {
  let db: IDatabase;
  let repo: ProviderStatusRepository<ProviderStatusBase>;

  beforeEach(() => {
    db = makeDatabase();
    repo = new ProviderStatusRepository(db, {
      tableName: "MockProviderStatus",
      columns: [
        { prop: "providerId", column: "ProviderId" },
        { prop: "initialFailure", column: "InitialFailure" },
        { prop: "mostRecentFailure", column: "MostRecentFailure" },
        { prop: "escalationLevel", column: "EscalationLevel" },
        { prop: "disabledTill", column: "DisabledTill" },
      ],
    });
  });

  it("upsert() inserts a new row when id is 0, then updates on subsequent upserts", () => {
    const inserted = repo.upsert(createProviderStatusBase({ providerId: 1, escalationLevel: 1 }));
    expect(inserted.id).toBeGreaterThan(0);

    repo.upsert({ ...inserted, escalationLevel: 2 });
    expect(repo.get(inserted.id).escalationLevel).toBe(2);
  });

  it("findByProviderId() returns the matching row, matching Query(c => c.ProviderId == providerId).SingleOrDefault()", () => {
    repo.upsert(createProviderStatusBase({ providerId: 42 }));
    expect(repo.findByProviderId(42)?.providerId).toBe(42);
    expect(repo.findByProviderId(999)).toBeUndefined();
  });

  it("deleteByProviderId() removes the matching row, matching Delete(c => c.ProviderId == providerId)", () => {
    repo.upsert(createProviderStatusBase({ providerId: 7 }));
    expect(repo.findByProviderId(7)).toBeDefined();

    repo.deleteByProviderId(7);

    expect(repo.findByProviderId(7)).toBeUndefined();
  });

  it("deleteByProviderId() is a no-op for a provider with no status row", () => {
    expect(() => repo.deleteByProviderId(12345)).not.toThrow();
  });
});
