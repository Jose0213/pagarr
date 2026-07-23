import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createDownloadClientDefinition } from "../DownloadClientDefinition.js";
import { DownloadClientRepository } from "../DownloadClientRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "DownloadClients" (
      "Id" INTEGER PRIMARY KEY,
      "Enable" INTEGER NOT NULL,
      "Name" TEXT NOT NULL,
      "Implementation" TEXT NOT NULL,
      "Settings" TEXT NOT NULL,
      "ConfigContract" TEXT NOT NULL,
      "Priority" INTEGER NOT NULL DEFAULT 1,
      "RemoveCompletedDownloads" INTEGER NOT NULL DEFAULT 1,
      "RemoveFailedDownloads" INTEGER NOT NULL DEFAULT 1,
      "Tags" TEXT NULL
    );
  `);
  return new Database("Test", sqlite);
}

describe("DownloadClientRepository", () => {
  let db: IDatabase;
  let repo: DownloadClientRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new DownloadClientRepository(db);
  });

  it("round-trips name/implementation/settings/tags/priority through insert + get", () => {
    const definition = createDownloadClientDefinition({
      name: "My qBittorrent",
      implementation: "QBittorrent",
      configContract: "QBittorrentSettings",
      settings: {
        host: "127.0.0.1",
        validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
      } as never,
      tags: [1, 2, 3],
      enable: true,
      priority: 2,
      removeCompletedDownloads: false,
      removeFailedDownloads: false,
    });

    const inserted = repo.insert(definition);
    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("My qBittorrent");
    expect(stored.implementation).toBe("QBittorrent");
    expect(stored.configContract).toBe("QBittorrentSettings");
    expect(stored.tags).toEqual([1, 2, 3]);
    expect(stored.enable).toBe(true);
    expect(stored.priority).toBe(2);
    expect(stored.removeCompletedDownloads).toBe(false);
    expect(stored.removeFailedDownloads).toBe(false);
    expect((stored.settings as { host: string }).host).toBe("127.0.0.1");
  });

  it("defaults priority/removeCompletedDownloads/removeFailedDownloads via createDownloadClientDefinition", () => {
    const definition = createDownloadClientDefinition({
      name: "Defaults",
      implementation: "Sabnzbd",
    });
    const inserted = repo.insert(definition);
    const stored = repo.get(inserted.id);
    expect(stored.priority).toBe(1);
    expect(stored.removeCompletedDownloads).toBe(true);
    expect(stored.removeFailedDownloads).toBe(true);
  });

  it("find() returns undefined for a missing id", () => {
    expect(repo.find(999)).toBeUndefined();
  });

  it("get() throws for a missing id", () => {
    expect(() => repo.get(999)).toThrow();
  });

  it("findByName() looks up by the Name column", () => {
    repo.insert(createDownloadClientDefinition({ name: "Unique Name", implementation: "Sabnzbd" }));
    expect(repo.findByName("Unique Name")?.implementation).toBe("Sabnzbd");
    expect(repo.findByName("Missing")).toBeUndefined();
  });

  it("update() persists changes to an existing row", () => {
    const inserted = repo.insert(
      createDownloadClientDefinition({ name: "Original", implementation: "Sabnzbd" })
    );
    repo.update({ ...inserted, name: "Renamed", priority: 50 });

    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("Renamed");
    expect(stored.priority).toBe(50);
  });

  it("upsert() inserts when id is 0 and updates otherwise", () => {
    const inserted = repo.upsert(
      createDownloadClientDefinition({ name: "Upserted", implementation: "Sabnzbd" })
    );
    expect(inserted.id).toBeGreaterThan(0);

    repo.upsert({ ...inserted, name: "Upserted Again" });
    expect(repo.get(inserted.id).name).toBe("Upserted Again");
  });

  it("delete() removes the row", () => {
    const inserted = repo.insert(
      createDownloadClientDefinition({ name: "ToDelete", implementation: "Sabnzbd" })
    );
    repo.delete(inserted.id);
    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("count() reflects the number of rows", () => {
    expect(repo.count()).toBe(0);
    repo.insert(createDownloadClientDefinition({ name: "One", implementation: "Sabnzbd" }));
    repo.insert(createDownloadClientDefinition({ name: "Two", implementation: "QBittorrent" }));
    expect(repo.count()).toBe(2);
  });

  it("getMany() returns rows matching the given ids and throws if counts mismatch", () => {
    const a = repo.insert(createDownloadClientDefinition({ name: "A", implementation: "Sabnzbd" }));
    const b = repo.insert(createDownloadClientDefinition({ name: "B", implementation: "Sabnzbd" }));

    const results = repo.getMany([a.id, b.id]);
    expect(results.map((r) => r.name).sort()).toEqual(["A", "B"]);

    expect(() => repo.getMany([a.id, 9999])).toThrow();
  });

  it("getMany() with an empty array returns an empty array", () => {
    expect(repo.getMany([])).toEqual([]);
  });

  it("insert() throws when the model already has a non-zero id", () => {
    expect(() =>
      repo.insert(createDownloadClientDefinition({ id: 5, name: "X", implementation: "Sabnzbd" }))
    ).toThrow();
  });

  it("update() throws when the model has id 0", () => {
    expect(() =>
      repo.update(createDownloadClientDefinition({ id: 0, name: "X", implementation: "Sabnzbd" }))
    ).toThrow();
  });

  it("leaves protocol at its default (not a persisted column)", () => {
    const inserted = repo.insert(
      createDownloadClientDefinition({ name: "NoProtocolColumn", implementation: "Sabnzbd" })
    );
    expect(repo.get(inserted.id).protocol).toBe(0);
  });
});
