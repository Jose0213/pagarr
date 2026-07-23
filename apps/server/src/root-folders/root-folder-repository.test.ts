import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../db/db-factory.js";
import { ModelAction, type IEventAggregator, type ModelEvent } from "../db/events.js";
import { ModelNotFoundException } from "../db/errors.js";
import { RootFolderRepository } from "./root-folder-repository.js";
import { MonitorType, NewItemMonitorType, type RootFolder } from "./root-folder.js";

/**
 * Uses the real ported migrations (0001_initial_setup.sql's RootFolders
 * table + 0019's DefaultNewItemMonitorOption column) against an in-memory
 * sqlite db, rather than a hand-rolled CREATE TABLE -- this is the actual
 * schema RootFolderRepository runs against in production, so it proves the
 * repository's column list matches the real migration history.
 */
function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

function baseFolder(overrides: Partial<RootFolder> = {}): RootFolder {
  return {
    id: 0,
    name: "Books",
    path: "/books",
    defaultMetadataProfileId: 1,
    defaultQualityProfileId: 1,
    defaultMonitorOption: MonitorType.All,
    defaultNewItemMonitorOption: NewItemMonitorType.New,
    defaultTags: new Set<number>(),
    isCalibreLibrary: false,
    calibreSettings: null,
    accessible: false,
    freeSpace: null,
    totalSpace: null,
    ...overrides,
  };
}

describe("RootFolderRepository", () => {
  it("inserts and round-trips a plain root folder", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(baseFolder());

    expect(inserted.id).toBeGreaterThan(0);
    const fetched = repo.get(inserted.id);
    expect(fetched.name).toBe("Books");
    expect(fetched.path).toBe("/books");
    expect(fetched.defaultMonitorOption).toBe(MonitorType.All);
    expect(fetched.defaultNewItemMonitorOption).toBe(NewItemMonitorType.New);
  });

  it("round-trips DefaultTags as a Set<number> via JSON encoding", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(baseFolder({ defaultTags: new Set([1, 2, 3]) }));
    const fetched = repo.get(inserted.id);

    expect(fetched.defaultTags).toBeInstanceOf(Set);
    expect([...fetched.defaultTags].sort()).toEqual([1, 2, 3]);
  });

  it("round-trips an empty DefaultTags set", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(baseFolder({ defaultTags: new Set() }));
    const fetched = repo.get(inserted.id);

    expect(fetched.defaultTags.size).toBe(0);
  });

  it("round-trips CalibreSettings as a structured object via JSON encoding", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(
      baseFolder({
        isCalibreLibrary: true,
        calibreSettings: {
          host: "calibre.local",
          port: 8080,
          urlBase: null,
          username: "user",
          password: "pass",
          library: "Calibre Library",
          outputFormat: "EPUB",
          outputProfile: 0,
          useSsl: false,
        },
      }),
    );

    const fetched = repo.get(inserted.id);
    expect(fetched.isCalibreLibrary).toBe(true);
    expect(fetched.calibreSettings).toEqual({
      host: "calibre.local",
      port: 8080,
      urlBase: null,
      username: "user",
      password: "pass",
      library: "Calibre Library",
      outputFormat: "EPUB",
      outputProfile: 0,
      useSsl: false,
    });
  });

  it("stores a null CalibreSettings for non-calibre root folders", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(baseFolder({ isCalibreLibrary: false, calibreSettings: null }));
    const fetched = repo.get(inserted.id);

    expect(fetched.calibreSettings).toBeNull();
  });

  it("defaults Accessible/FreeSpace/TotalSpace to unpopulated values on load (computed, not persisted)", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(baseFolder());
    const fetched = repo.get(inserted.id);

    expect(fetched.accessible).toBe(false);
    expect(fetched.freeSpace).toBeNull();
    expect(fetched.totalSpace).toBeNull();
  });

  it("all() returns every inserted root folder", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    repo.insert(baseFolder({ path: "/books" }));
    repo.insert(baseFolder({ path: "/audiobooks" }));

    expect(repo.all()).toHaveLength(2);
  });

  it("get() throws ModelNotFoundException for a missing id", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    expect(() => repo.get(999)).toThrow(ModelNotFoundException);
  });

  it("update() persists changed fields", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    const inserted = repo.insert(baseFolder());
    repo.update({ ...inserted, name: "Renamed", defaultTags: new Set([5]) });

    const fetched = repo.get(inserted.id);
    expect(fetched.name).toBe("Renamed");
    expect([...fetched.defaultTags]).toEqual([5]);
  });

  describe("delete", () => {
    it("removes the row", () => {
      const db = makeDatabase();
      const repo = new RootFolderRepository(db);

      const inserted = repo.insert(baseFolder());
      repo.delete(inserted.id);

      expect(repo.find(inserted.id)).toBeUndefined();
    });

    it("always publishes a Deleted model event, ported from RootFolderRepository.Delete's ModelDeleted() call", () => {
      const db = makeDatabase();
      const published: ModelEvent<RootFolder>[] = [];
      const aggregator: IEventAggregator = {
        publishEvent: (e) => published.push(e as ModelEvent<RootFolder>),
      };
      const repo = new RootFolderRepository(db, aggregator);

      const inserted = repo.insert(baseFolder());
      published.length = 0; // discard the Created event from insert()

      repo.delete(inserted.id);

      expect(published).toHaveLength(1);
      expect(published[0]!.action).toBe(ModelAction.Deleted);
      expect(published[0]!.modelId).toBe(inserted.id);
    });
  });

  describe("model events (PublishModelEvents => true)", () => {
    it("publishes a Created event on insert", () => {
      const db = makeDatabase();
      const published: ModelEvent<RootFolder>[] = [];
      const aggregator: IEventAggregator = {
        publishEvent: (e) => published.push(e as ModelEvent<RootFolder>),
      };
      const repo = new RootFolderRepository(db, aggregator);

      repo.insert(baseFolder());

      expect(published).toHaveLength(1);
      expect(published[0]!.action).toBe(ModelAction.Created);
    });

    it("publishes an Updated event on update", () => {
      const db = makeDatabase();
      const published: ModelEvent<RootFolder>[] = [];
      const aggregator: IEventAggregator = {
        publishEvent: (e) => published.push(e as ModelEvent<RootFolder>),
      };
      const repo = new RootFolderRepository(db, aggregator);

      const inserted = repo.insert(baseFolder());
      repo.update({ ...inserted, name: "Changed" });

      expect(published).toHaveLength(2);
      expect(published[1]!.action).toBe(ModelAction.Updated);
    });

    it("does not publish events when no aggregator is supplied (NullEventAggregator)", () => {
      const db = makeDatabase();
      const repo = new RootFolderRepository(db);

      expect(() => repo.insert(baseFolder())).not.toThrow();
    });
  });

  it("enforces the unique Path constraint from the real migration schema", () => {
    const db = makeDatabase();
    const repo = new RootFolderRepository(db);

    repo.insert(baseFolder({ path: "/books" }));

    expect(() => repo.insert(baseFolder({ path: "/books" }))).toThrow();
  });
});
