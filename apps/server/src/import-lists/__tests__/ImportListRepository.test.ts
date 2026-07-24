import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { ImportListRepository } from "../ImportListRepository.js";
import {
  createImportListDefinition,
  ImportListMonitorType,
  NewItemMonitorTypes,
} from "../ImportListDefinition.js";

/**
 * Uses the real ported migrations (0001's ImportLists table + 0002's
 * ShouldSearch + 0017's ShouldMonitorExisting + 0019's MonitorNewItems)
 * against an in-memory sqlite db.
 */
function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

describe("ImportListRepository", () => {
  it("inserts and round-trips every column including the monitor-type ordinal mapping", () => {
    const db = makeDatabase();
    const repo = new ImportListRepository(db);

    const inserted = repo.insert(
      createImportListDefinition({
        name: "My Goodreads List",
        implementation: "GoodreadsListImportList",
        configContract: "GoodreadsListImportListSettings",
        enableAutomaticAdd: true,
        rootFolderPath: "/books",
        shouldMonitor: ImportListMonitorType.EntireAuthor,
        profileId: 1,
        metadataProfileId: 2,
        shouldSearch: true,
        shouldMonitorExisting: true,
        monitorNewItems: NewItemMonitorTypes.New,
        tags: [1, 2, 3],
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const fetched = repo.get(inserted.id);
    expect(fetched.name).toBe("My Goodreads List");
    expect(fetched.enableAutomaticAdd).toBe(true);
    expect(fetched.rootFolderPath).toBe("/books");
    expect(fetched.shouldMonitor).toBe(ImportListMonitorType.EntireAuthor);
    expect(fetched.profileId).toBe(1);
    expect(fetched.metadataProfileId).toBe(2);
    expect(fetched.shouldSearch).toBe(true);
    expect(fetched.shouldMonitorExisting).toBe(true);
    expect(fetched.monitorNewItems).toBe(NewItemMonitorTypes.New);
    expect(fetched.tags).toEqual([1, 2, 3]);
  });

  it("round-trips every ImportListMonitorType ordinal", () => {
    const db = makeDatabase();
    const repo = new ImportListRepository(db);

    for (const monitorType of [
      ImportListMonitorType.None,
      ImportListMonitorType.SpecificBook,
      ImportListMonitorType.EntireAuthor,
    ]) {
      const inserted = repo.insert(
        createImportListDefinition({ name: `list-${monitorType}`, shouldMonitor: monitorType })
      );
      expect(repo.get(inserted.id).shouldMonitor).toBe(monitorType);
    }
  });

  it("listType/minRefreshIntervalMs are NOT persisted columns -- round-trip back to defaults on read", () => {
    const db = makeDatabase();
    const repo = new ImportListRepository(db);

    const inserted = repo.insert(
      createImportListDefinition({
        name: "Not persisted",
        listType: "Goodreads" as never,
        minRefreshIntervalMs: 999999,
      })
    );

    const fetched = repo.get(inserted.id);
    // Defaults from createImportListDefinition(), not the values passed above --
    // see ImportListRepository.ts's doc comment on why these two fields
    // aren't backed by columns (ImportListFactory stamps them in-memory).
    expect(fetched.listType).toBe("Program");
    expect(fetched.minRefreshIntervalMs).toBe(0);
  });

  it("update persists changes and upsert dispatches on id", () => {
    const db = makeDatabase();
    const repo = new ImportListRepository(db);

    const inserted = repo.insert(createImportListDefinition({ name: "Original" }));
    const updated = repo.upsert({ ...inserted, name: "Renamed" });

    expect(updated.id).toBe(inserted.id);
    expect(repo.get(inserted.id).name).toBe("Renamed");
    expect(repo.count()).toBe(1);
  });

  it("delete removes the row", () => {
    const db = makeDatabase();
    const repo = new ImportListRepository(db);

    const inserted = repo.insert(createImportListDefinition({ name: "ToDelete" }));
    repo.delete(inserted.id);

    expect(repo.find(inserted.id)).toBeUndefined();
  });
});
