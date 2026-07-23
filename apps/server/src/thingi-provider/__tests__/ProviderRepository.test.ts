import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createProviderDefinition } from "../ProviderDefinition.js";
import { ProviderRepository } from "../ProviderRepository.js";
import type { IProviderConfig, ValidationResult } from "../IProviderConfig.js";
import { NULL_CONFIG_INSTANCE } from "../NullConfig.js";

interface MockSettings extends IProviderConfig {
  host: string;
}

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "MockProviders" (
      "Id" INTEGER PRIMARY KEY,
      "Name" TEXT NOT NULL UNIQUE,
      "Implementation" TEXT NOT NULL,
      "Settings" TEXT NULL,
      "ConfigContract" TEXT NULL,
      "Enable" INTEGER NULL,
      "Tags" TEXT NULL
    );
  `);
  return new Database("Test", sqlite);
}

function mockSettingsParser(
  configContract: string | null,
  json: string | null
): MockSettings | null {
  if (json === null || configContract !== "MockSettings") {
    return NULL_CONFIG_INSTANCE as unknown as MockSettings;
  }
  return JSON.parse(json) as MockSettings;
}

describe("ProviderRepository", () => {
  let db: IDatabase;
  let repo: ProviderRepository<MockSettings>;

  beforeEach(() => {
    db = makeDatabase();
    repo = new ProviderRepository<MockSettings>(db, "MockProviders", mockSettingsParser);
  });

  it("round-trips name/implementation/settings/configContract/enable/tags through insert + get", () => {
    const definition = createProviderDefinition<MockSettings>({
      name: "My Provider",
      implementation: "MockProvider",
      configContract: "MockSettings",
      settings: {
        host: "localhost",
        validate: (): ValidationResult => ({ isValid: true, hasWarnings: false, errors: [] }),
      },
      enable: true,
      tags: [1, 2, 3],
    });

    const inserted = repo.insert(definition);
    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("My Provider");
    expect(stored.implementation).toBe("MockProvider");
    expect(stored.configContract).toBe("MockSettings");
    expect(stored.enable).toBe(true);
    expect(stored.tags).toEqual([1, 2, 3]);
    expect(stored.settings?.host).toBe("localhost");
  });

  it("falls back to the settings parser's NullConfig branch for an unrecognized configContract", () => {
    const definition = createProviderDefinition<MockSettings>({
      name: "Unknown",
      implementation: "Unknown",
      configContract: "SomethingElse",
      settings: null,
      enable: false,
    });

    const inserted = repo.insert(definition);
    const stored = repo.get(inserted.id);
    expect(stored.settings).toBe(NULL_CONFIG_INSTANCE);
  });

  it("find() returns undefined for a missing id, get() throws", () => {
    expect(repo.find(999)).toBeUndefined();
    expect(() => repo.get(999)).toThrow();
  });

  it("update() persists changes to an existing row", () => {
    const inserted = repo.insert(
      createProviderDefinition<MockSettings>({ name: "Original", implementation: "Mock" })
    );
    repo.update({ ...inserted, name: "Renamed", enable: true });

    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("Renamed");
    expect(stored.enable).toBe(true);
  });

  it("upsert() inserts when id is 0 and updates otherwise", () => {
    const created = repo.upsert(
      createProviderDefinition<MockSettings>({ name: "New", implementation: "Mock" })
    );
    expect(created.id).toBeGreaterThan(0);

    repo.upsert({ ...created, name: "Updated" });
    expect(repo.get(created.id).name).toBe("Updated");
  });

  it("delete()/deleteMany() remove rows", () => {
    const a = repo.insert(
      createProviderDefinition<MockSettings>({ name: "A", implementation: "Mock" })
    );
    const b = repo.insert(
      createProviderDefinition<MockSettings>({ name: "B", implementation: "Mock" })
    );

    repo.delete(a.id);
    expect(repo.find(a.id)).toBeUndefined();

    repo.deleteMany([b.id]);
    expect(repo.find(b.id)).toBeUndefined();
  });

  it("getMany() throws when a requested id doesn't exist, matching BasicRepository's Get(ids) contract", () => {
    const a = repo.insert(
      createProviderDefinition<MockSettings>({ name: "A", implementation: "Mock" })
    );
    expect(() => repo.getMany([a.id, 99999])).toThrow();
  });

  it("insert() throws when the model already has a non-zero id", () => {
    expect(() =>
      repo.insert(
        createProviderDefinition<MockSettings>({ id: 5, name: "X", implementation: "Mock" })
      )
    ).toThrow();
  });

  it("update() throws when the model has id 0", () => {
    expect(() =>
      repo.update(
        createProviderDefinition<MockSettings>({ id: 0, name: "X", implementation: "Mock" })
      )
    ).toThrow();
  });

  it("count() reflects the number of rows", () => {
    expect(repo.count()).toBe(0);
    repo.insert(createProviderDefinition<MockSettings>({ name: "One", implementation: "Mock" }));
    expect(repo.count()).toBe(1);
  });
});
