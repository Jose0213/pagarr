import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createDownloadClientStatus } from "../DownloadClientStatus.js";
import { DownloadClientStatusRepository } from "../DownloadClientStatusRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "DownloadClientStatus" (
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

describe("DownloadClientStatusRepository", () => {
  let db: IDatabase;
  let repo: DownloadClientStatusRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new DownloadClientStatusRepository(db);
  });

  it("upsert() inserts a new row when id is 0", () => {
    const inserted = repo.upsert(createDownloadClientStatus({ providerId: 7, escalationLevel: 2 }));
    expect(inserted.id).toBeGreaterThan(0);
    expect(repo.findByProviderId(7)?.escalationLevel).toBe(2);
  });

  it("upsert() updates an existing row when id is non-zero", () => {
    const inserted = repo.upsert(createDownloadClientStatus({ providerId: 7 }));
    repo.upsert({ ...inserted, escalationLevel: 5 });

    expect(repo.find(inserted.id)?.escalationLevel).toBe(5);
  });

  it("findByProviderId() returns undefined when no row matches", () => {
    expect(repo.findByProviderId(123)).toBeUndefined();
  });

  it("deleteByProviderId() removes the matching row", () => {
    repo.upsert(createDownloadClientStatus({ providerId: 9 }));
    repo.deleteByProviderId(9);
    expect(repo.findByProviderId(9)).toBeUndefined();
  });

  it("all() returns every row", () => {
    repo.upsert(createDownloadClientStatus({ providerId: 1 }));
    repo.upsert(createDownloadClientStatus({ providerId: 2 }));
    expect(repo.all()).toHaveLength(2);
  });
});
