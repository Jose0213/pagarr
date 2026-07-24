import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { ImportListExclusionRepository } from "../ImportListExclusionRepository.js";
import { createImportListExclusion } from "../ImportListExclusion.js";

function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

describe("ImportListExclusionRepository", () => {
  it("inserts and round-trips a plain exclusion", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    const inserted = repo.insert(
      createImportListExclusion({ foreignId: "gr-123", name: "Some Author" })
    );

    expect(inserted.id).toBeGreaterThan(0);
    expect(repo.get(inserted.id).name).toBe("Some Author");
  });

  it("findByForeignId finds a single exclusion by ForeignId", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    repo.insert(createImportListExclusion({ foreignId: "gr-1", name: "A" }));
    repo.insert(createImportListExclusion({ foreignId: "gr-2", name: "B" }));

    expect(repo.findByForeignId("gr-2")?.name).toBe("B");
    expect(repo.findByForeignId("gr-missing")).toBeUndefined();
  });

  it("findByForeignIds uses an IN query, matching multiple ids", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    repo.insert(createImportListExclusion({ foreignId: "gr-1", name: "A" }));
    repo.insert(createImportListExclusion({ foreignId: "gr-2", name: "B" }));
    repo.insert(createImportListExclusion({ foreignId: "gr-3", name: "C" }));

    const found = repo.findByForeignIds(["gr-1", "gr-3", "gr-missing"]);

    expect(found.map((f) => f.name).sort()).toEqual(["A", "C"]);
  });

  it("findByForeignIds with an empty array returns an empty array without querying", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    expect(repo.findByForeignIds([])).toEqual([]);
  });

  it("update persists a changed name", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    const inserted = repo.insert(createImportListExclusion({ foreignId: "gr-1", name: "Old" }));
    repo.update({ ...inserted, name: "New" });

    expect(repo.get(inserted.id).name).toBe("New");
  });

  it("delete removes the row", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    const inserted = repo.insert(createImportListExclusion({ foreignId: "gr-1", name: "A" }));
    repo.delete(inserted.id);

    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("ForeignId has a UNIQUE constraint at the schema level", () => {
    const db = makeDatabase();
    const repo = new ImportListExclusionRepository(db);

    repo.insert(createImportListExclusion({ foreignId: "gr-dup", name: "First" }));

    expect(() =>
      repo.insert(createImportListExclusion({ foreignId: "gr-dup", name: "Second" }))
    ).toThrow();
  });
});
