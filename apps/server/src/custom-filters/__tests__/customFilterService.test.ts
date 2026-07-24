import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../db/db-factory.js";
import { CustomFilterRepository } from "../customFilterRepository.js";
import { CustomFilterService } from "../customFilterService.js";

function makeService(): CustomFilterService {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  return new CustomFilterService(new CustomFilterRepository(db));
}

describe("CustomFilterService", () => {
  it("add() inserts a row and assigns an id", () => {
    const service = makeService();

    const created = service.add({ id: 0, type: "authors", label: "Missing files", filters: "[]" });

    expect(created.id).toBeGreaterThan(0);
    expect(service.get(created.id)).toEqual(created);
  });

  it("all() returns every custom filter", () => {
    const service = makeService();
    service.add({ id: 0, type: "authors", label: "A", filters: "[]" });
    service.add({ id: 0, type: "books", label: "B", filters: "[]" });

    expect(service.all()).toHaveLength(2);
  });

  it("update() persists changes", () => {
    const service = makeService();
    const created = service.add({ id: 0, type: "authors", label: "Old", filters: "[]" });

    service.update({ ...created, label: "New" });

    expect(service.get(created.id).label).toBe("New");
  });

  it("delete() removes the row", () => {
    const service = makeService();
    const created = service.add({ id: 0, type: "authors", label: "Gone", filters: "[]" });

    service.delete(created.id);

    expect(() => service.get(created.id)).toThrow();
  });
});
