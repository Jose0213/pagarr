import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createNotificationDefinition } from "../NotificationDefinition.js";
import { NotificationRepository } from "../NotificationRepository.js";

/** Schema matches the real Notifications table exactly (migrations 0001, 0004, 0021, 0025, 0038). */
function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "Notifications" (
      "Id" INTEGER PRIMARY KEY,
      "Name" TEXT NOT NULL,
      "OnGrab" INTEGER NOT NULL,
      "Settings" TEXT NOT NULL,
      "Implementation" TEXT NOT NULL,
      "ConfigContract" TEXT NULL,
      "OnUpgrade" INTEGER NULL,
      "Tags" TEXT NULL,
      "OnRename" INTEGER NOT NULL,
      "OnReleaseImport" INTEGER NOT NULL DEFAULT 0,
      "OnHealthIssue" INTEGER NOT NULL DEFAULT 0,
      "IncludeHealthWarnings" INTEGER NOT NULL DEFAULT 0,
      "OnDownloadFailure" INTEGER NOT NULL DEFAULT 0,
      "OnImportFailure" INTEGER NOT NULL DEFAULT 0,
      "OnBookRetag" INTEGER NOT NULL DEFAULT 0,
      "OnAuthorDelete" INTEGER NOT NULL DEFAULT 0,
      "OnBookDelete" INTEGER NOT NULL DEFAULT 0,
      "OnBookFileDelete" INTEGER NOT NULL DEFAULT 0,
      "OnBookFileDeleteForUpgrade" INTEGER NOT NULL DEFAULT 0,
      "OnApplicationUpdate" INTEGER NOT NULL DEFAULT 1,
      "OnAuthorAdded" INTEGER NOT NULL DEFAULT 0
    );
  `);
  return new Database("Test", sqlite);
}

describe("NotificationRepository", () => {
  let db: IDatabase;
  let repo: NotificationRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new NotificationRepository(db);
  });

  it("insert() assigns an id and round-trips every OnX flag", () => {
    const inserted = repo.insert(
      createNotificationDefinition({
        name: "Discord",
        implementation: "Discord",
        configContract: "DiscordSettings",
        onGrab: true,
        onBookRetag: true,
        includeHealthWarnings: true,
        tags: [1, 2],
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const found = repo.get(inserted.id);
    expect(found.name).toBe("Discord");
    expect(found.onGrab).toBe(true);
    expect(found.onBookRetag).toBe(true);
    expect(found.includeHealthWarnings).toBe(true);
    expect(found.onRename).toBe(false);
    expect(found.tags).toEqual([1, 2]);
  });

  it("insert() throws when the model already has a non-zero id", () => {
    expect(() =>
      repo.insert(createNotificationDefinition({ id: 5, name: "X", implementation: "X" }))
    ).toThrow(/existing ID/);
  });

  it("update() persists changes and does not touch the row's id", () => {
    const inserted = repo.insert(
      createNotificationDefinition({ name: "Slack", implementation: "Slack" })
    );
    repo.update({ ...inserted, name: "Slack Renamed", onGrab: true });

    const found = repo.get(inserted.id);
    expect(found.name).toBe("Slack Renamed");
    expect(found.onGrab).toBe(true);
  });

  it("update() throws when the model id is 0", () => {
    expect(() =>
      repo.update(createNotificationDefinition({ name: "X", implementation: "X" }))
    ).toThrow(/ID 0/);
  });

  it("delete() removes the row", () => {
    const inserted = repo.insert(
      createNotificationDefinition({ name: "Webhook", implementation: "Webhook" })
    );
    repo.delete(inserted.id);
    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("all() returns every stored definition", () => {
    repo.insert(createNotificationDefinition({ name: "A", implementation: "A" }));
    repo.insert(createNotificationDefinition({ name: "B", implementation: "B" }));
    expect(repo.all()).toHaveLength(2);
  });

  it("getMany() throws when a requested id doesn't exist, matching BasicRepository.Get(ids)", () => {
    const a = repo.insert(createNotificationDefinition({ name: "A", implementation: "A" }));
    expect(() => repo.getMany([a.id, 99999])).toThrow(/Expected query to return/);
  });

  it("count() reflects the number of stored rows", () => {
    expect(repo.count()).toBe(0);
    repo.insert(createNotificationDefinition({ name: "A", implementation: "A" }));
    expect(repo.count()).toBe(1);
  });

  it("settings round-trips as JSON", () => {
    const inserted = repo.insert(
      createNotificationDefinition({
        name: "Custom",
        implementation: "Custom",
        settings: {
          validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
          foo: "bar",
        } as never,
      })
    );

    const found = repo.get(inserted.id);
    expect((found.settings as unknown as { foo: string }).foo).toBe("bar");
  });

  it("read definitions default every SupportsOnX flag to false -- those are not persisted columns (see this file's doc comment)", () => {
    const inserted = repo.insert(
      createNotificationDefinition({ name: "X", implementation: "X", supportsOnGrab: true })
    );

    // supportsOnGrab=true was passed to createNotificationDefinition() but this
    // repository has no column for it, so it does NOT round-trip.
    const found = repo.get(inserted.id);
    expect(found.supportsOnGrab).toBe(false);
  });
});
