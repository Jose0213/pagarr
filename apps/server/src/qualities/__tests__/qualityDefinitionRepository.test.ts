import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database, type IDatabase } from "../../db/database.js";
import { migrate } from "../../db/migration-runner.js";
import { QualityDefinitionRepository } from "../qualityDefinitionRepository.js";
import { newQualityDefinition } from "../qualityDefinition.js";
import { Quality } from "../quality.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  migrate(sqlite, MAIN_MIGRATIONS_DIR);
  return new Database("Test", sqlite);
}

describe("QualityDefinitionRepository (against the real migrated schema)", () => {
  let db: IDatabase;
  let repo: QualityDefinitionRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new QualityDefinitionRepository(db);
  });

  it("inserts a definition and round-trips the Quality object through the int column", () => {
    const inserted = repo.insert(newQualityDefinition(Quality.EPUB, { minSize: 0, maxSize: 350 }));

    expect(inserted.id).toBeGreaterThan(0);

    const fetched = repo.get(inserted.id);
    expect(fetched.quality).toEqual(Quality.EPUB);
    expect(fetched.title).toBe("EPUB");
    expect(fetched.minSize).toBe(0);
    expect(fetched.maxSize).toBe(350);
  });

  it("stores a null MaxSize for unbounded qualities (e.g. FLAC)", () => {
    const inserted = repo.insert(newQualityDefinition(Quality.FLAC, { minSize: 0, maxSize: null }));

    const fetched = repo.get(inserted.id);
    expect(fetched.maxSize).toBeNull();
  });

  it("all() returns every inserted definition", () => {
    repo.insert(newQualityDefinition(Quality.MOBI));
    repo.insert(newQualityDefinition(Quality.AZW3));

    const all = repo.all();
    expect(all).toHaveLength(2);
    expect(all.map((d) => d.quality.id).sort()).toEqual(
      [Quality.MOBI.id, Quality.AZW3.id].sort((a, b) => a - b)
    );
  });

  it("insertMany inserts all definitions transactionally", () => {
    const inserted = repo.insertMany([
      newQualityDefinition(Quality.MOBI),
      newQualityDefinition(Quality.EPUB),
      newQualityDefinition(Quality.AZW3),
    ]);

    expect(inserted).toHaveLength(3);
    expect(repo.count()).toBe(3);
  });

  it("update() persists title/minSize/maxSize changes", () => {
    const inserted = repo.insert(newQualityDefinition(Quality.MOBI, { minSize: 0, maxSize: 100 }));

    const updated = repo.update({ ...inserted, title: "Custom MOBI Title", maxSize: 200 });
    expect(updated.title).toBe("Custom MOBI Title");

    const fetched = repo.get(inserted.id);
    expect(fetched.title).toBe("Custom MOBI Title");
    expect(fetched.maxSize).toBe(200);
  });

  it("deleteMany removes the given definitions", () => {
    const [a, b] = repo.insertMany([
      newQualityDefinition(Quality.MOBI),
      newQualityDefinition(Quality.EPUB),
    ]);

    repo.deleteMany([a!]);

    expect(repo.count()).toBe(1);
    expect(repo.find(a!.id)).toBeUndefined();
    expect(repo.find(b!.id)).toBeDefined();
  });

  it("enforces the Quality column's UNIQUE constraint from the migrated schema", () => {
    repo.insert(newQualityDefinition(Quality.MOBI, { minSize: 0, maxSize: 100 }));

    expect(() =>
      repo.insert(newQualityDefinition(Quality.MOBI, { minSize: 0, maxSize: 200 }))
    ).toThrow();
  });

  it("groupWeight/weight are not persisted -- always come back as the qualityDefinition.ts defaults", () => {
    const inserted = repo.insert(
      newQualityDefinition(Quality.MOBI, { weight: 999, groupWeight: 999 })
    );

    const fetched = repo.get(inserted.id);
    expect(fetched.weight).toBe(0);
    expect(fetched.groupWeight).toBe(0);
  });
});
