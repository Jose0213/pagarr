import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createIndexerDefinition } from "../IndexerDefinition.js";
import { IndexerRepository } from "../IndexerRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "Indexers" (
      "Id" INTEGER PRIMARY KEY,
      "Name" TEXT NOT NULL UNIQUE,
      "Implementation" TEXT NOT NULL,
      "Settings" TEXT NULL,
      "ConfigContract" TEXT NULL,
      "EnableRss" INTEGER NULL,
      "EnableAutomaticSearch" INTEGER NULL,
      "EnableInteractiveSearch" INTEGER NOT NULL,
      "Tags" TEXT NULL,
      "Priority" INTEGER NOT NULL DEFAULT 25,
      "DownloadClientId" INTEGER NOT NULL DEFAULT 0
    );
  `);
  return new Database("Test", sqlite);
}

describe("IndexerRepository", () => {
  let db: IDatabase;
  let repo: IndexerRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new IndexerRepository(db);
  });

  it("round-trips name/implementation/settings/tags/priority through insert + get", () => {
    const definition = createIndexerDefinition({
      name: "My Torznab",
      implementation: "Torznab",
      configContract: "TorznabSettings",
      settings: {
        baseUrl: "http://x/",
        validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
      },
      tags: [1, 2, 3],
      enableRss: true,
      enableAutomaticSearch: true,
      enableInteractiveSearch: false,
      priority: 30,
      downloadClientId: 7,
    });

    const inserted = repo.insert(definition);
    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("My Torznab");
    expect(stored.implementation).toBe("Torznab");
    expect(stored.configContract).toBe("TorznabSettings");
    expect(stored.tags).toEqual([1, 2, 3]);
    expect(stored.enableRss).toBe(true);
    expect(stored.enableAutomaticSearch).toBe(true);
    expect(stored.enableInteractiveSearch).toBe(false);
    expect(stored.priority).toBe(30);
    expect(stored.downloadClientId).toBe(7);
    expect((stored.settings as { baseUrl: string }).baseUrl).toBe("http://x/");
  });

  it("defaults priority to DEFAULT_PRIORITY (25) via createIndexerDefinition", () => {
    const definition = createIndexerDefinition({ name: "Defaults", implementation: "Newznab" });
    const inserted = repo.insert(definition);
    expect(repo.get(inserted.id).priority).toBe(25);
  });

  it("find() returns undefined for a missing id", () => {
    expect(repo.find(999)).toBeUndefined();
  });

  it("get() throws ModelNotFoundException for a missing id", () => {
    expect(() => repo.get(999)).toThrow();
  });

  it("findByName() looks up by the unique Name column", () => {
    repo.insert(createIndexerDefinition({ name: "Unique Name", implementation: "Newznab" }));
    expect(repo.findByName("Unique Name")?.implementation).toBe("Newznab");
    expect(repo.findByName("Missing")).toBeUndefined();
  });

  it("update() persists changes to an existing row", () => {
    const inserted = repo.insert(
      createIndexerDefinition({ name: "Original", implementation: "Newznab" })
    );
    repo.update({ ...inserted, name: "Renamed", priority: 50 });

    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("Renamed");
    expect(stored.priority).toBe(50);
  });

  it("delete() removes the row", () => {
    const inserted = repo.insert(
      createIndexerDefinition({ name: "ToDelete", implementation: "Newznab" })
    );
    repo.delete(inserted.id);
    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("count() reflects the number of rows", () => {
    expect(repo.count()).toBe(0);
    repo.insert(createIndexerDefinition({ name: "One", implementation: "Newznab" }));
    repo.insert(createIndexerDefinition({ name: "Two", implementation: "Torznab" }));
    expect(repo.count()).toBe(2);
  });
});
