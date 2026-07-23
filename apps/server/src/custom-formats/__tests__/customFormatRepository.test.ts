import { beforeEach, describe, expect, it } from "vitest";
import type { IDatabase } from "../../db/database.js";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../db/db-factory.js";
import { CustomFormatRepository } from "../customFormatRepository.js";
import { newCustomFormat } from "../customFormat.js";
import { ReleaseTitleSpecification } from "../specifications/releaseTitleSpecification.js";
import { SizeSpecification } from "../specifications/sizeSpecification.js";
import { IndexerFlagSpecification } from "../specifications/indexerFlagSpecification.js";
import { IndexerFlags } from "../indexerFlags.js";

function makeRepo(): { db: IDatabase; repo: CustomFormatRepository } {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  return { db, repo: new CustomFormatRepository(db) };
}

/** Ported against the real "CustomFormats" table (db/migrations/0026_add_custom_formats.sql). */
describe("CustomFormatRepository", () => {
  let repo: CustomFormatRepository;

  beforeEach(() => {
    ({ repo } = makeRepo());
  });

  it("inserts and round-trips name + includeCustomFormatWhenRenaming", () => {
    const format = newCustomFormat("x264");
    format.includeCustomFormatWhenRenaming = true;

    const inserted = repo.insert(format);

    expect(inserted.id).toBeGreaterThan(0);
    const stored = repo.get(inserted.id);
    expect(stored.name).toBe("x264");
    expect(stored.includeCustomFormatWhenRenaming).toBe(true);
    expect(stored.specifications).toEqual([]);
  });

  it("round-trips a ReleaseTitleSpecification through the Specifications JSON column", () => {
    const spec = new ReleaseTitleSpecification();
    spec.name = "Preferred Words";
    spec.value = "\\b(SPARKS|Framestor)\\b";
    spec.negate = false;
    spec.required = true;

    const format = newCustomFormat("Preferred", [spec]);
    const inserted = repo.insert(format);
    const stored = repo.get(inserted.id);

    expect(stored.specifications).toHaveLength(1);
    const storedSpec = stored.specifications[0] as ReleaseTitleSpecification;
    expect(storedSpec).toBeInstanceOf(ReleaseTitleSpecification);
    expect(storedSpec.name).toBe("Preferred Words");
    expect(storedSpec.value).toBe("\\b(SPARKS|Framestor)\\b");
    expect(storedSpec.required).toBe(true);
    expect(storedSpec.negate).toBe(false);
  });

  it("round-trips a SizeSpecification's min/max fields", () => {
    const spec = new SizeSpecification();
    spec.name = "Small";
    spec.min = 0;
    spec.max = 10;

    const inserted = repo.insert(newCustomFormat("SizeCheck", [spec]));
    const stored = repo.get(inserted.id);

    const storedSpec = stored.specifications[0] as SizeSpecification;
    expect(storedSpec).toBeInstanceOf(SizeSpecification);
    expect(storedSpec.min).toBe(0);
    expect(storedSpec.max).toBe(10);
  });

  it("round-trips an IndexerFlagSpecification's value", () => {
    const spec = new IndexerFlagSpecification();
    spec.name = "Freeleech";
    spec.value = IndexerFlags.Freeleech;

    const inserted = repo.insert(newCustomFormat("FreeleechFormat", [spec]));
    const stored = repo.get(inserted.id);

    const storedSpec = stored.specifications[0] as IndexerFlagSpecification;
    expect(storedSpec).toBeInstanceOf(IndexerFlagSpecification);
    expect(storedSpec.value).toBe(IndexerFlags.Freeleech);
  });

  it("round-trips multiple specifications preserving order and concrete types", () => {
    const title = new ReleaseTitleSpecification();
    title.name = "Title";
    title.value = "foo";

    const size = new SizeSpecification();
    size.name = "Size";
    size.min = 1;
    size.max = 5;

    const inserted = repo.insert(newCustomFormat("Multi", [title, size]));
    const stored = repo.get(inserted.id);

    expect(stored.specifications).toHaveLength(2);
    expect(stored.specifications[0]).toBeInstanceOf(ReleaseTitleSpecification);
    expect(stored.specifications[1]).toBeInstanceOf(SizeSpecification);
  });

  it("Name column is UNIQUE (matches migration 0026's CustomFormats table)", () => {
    repo.insert(newCustomFormat("Dupe"));
    expect(() => repo.insert(newCustomFormat("Dupe"))).toThrow();
  });

  it("all() returns every inserted format", () => {
    repo.insert(newCustomFormat("A"));
    repo.insert(newCustomFormat("B"));

    expect(
      repo
        .all()
        .map((f) => f.name)
        .sort()
    ).toEqual(["A", "B"]);
  });

  it("update() persists changes", () => {
    const inserted = repo.insert(newCustomFormat("Original"));

    repo.update({ ...inserted, name: "Renamed" });

    expect(repo.get(inserted.id).name).toBe("Renamed");
  });

  it("delete() removes the row", () => {
    const inserted = repo.insert(newCustomFormat("ToDelete"));

    repo.delete(inserted.id);

    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("get() throws ModelNotFoundException for a missing id", () => {
    expect(() => repo.get(999)).toThrow(/CustomFormats with ID 999 does not exist/);
  });

  it("insert() throws for a non-zero id", () => {
    expect(() => repo.insert({ ...newCustomFormat("Bad"), id: 5 })).toThrow(/existing ID 5/);
  });

  it("getMany() throws when a requested id doesn't exist", () => {
    const a = repo.insert(newCustomFormat("A"));
    expect(() => repo.getMany([a.id, 999])).toThrow(
      /Expected query to return 2 rows but returned 1/
    );
  });

  it("count()/hasItems() reflect the table contents", () => {
    expect(repo.hasItems()).toBe(false);
    expect(repo.count()).toBe(0);

    repo.insert(newCustomFormat("One"));

    expect(repo.hasItems()).toBe(true);
    expect(repo.count()).toBe(1);
  });
});
