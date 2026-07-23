import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { MetadataRepository } from "../metadataRepository.js";
import { createMetadataDefinition } from "../metadataDefinition.js";

/** Real ported Metadata table (0001_initial_setup.sql), same rationale as root-folder-repository.test.ts. */
function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

describe("MetadataRepository", () => {
  it("inserts and round-trips a metadata definition", () => {
    const repo = new MetadataRepository(makeDatabase());

    const inserted = repo.insert(
      createMetadataDefinition({
        name: "Kodi",
        implementation: "KodiMetadata",
        enable: true,
        settings: { authorImage: true },
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const fetched = repo.get(inserted.id);
    expect(fetched.name).toBe("Kodi");
    expect(fetched.implementation).toBe("KodiMetadata");
    expect(fetched.enable).toBe(true);
    expect(fetched.settings).toEqual({ authorImage: true });
  });

  it("findByName looks up a definition by its Name column", () => {
    const repo = new MetadataRepository(makeDatabase());
    repo.insert(createMetadataDefinition({ name: "Roksbox", implementation: "RoksboxMetadata" }));

    expect(repo.findByName("Roksbox")?.implementation).toBe("RoksboxMetadata");
    expect(repo.findByName("Missing")).toBeUndefined();
  });

  it("all() returns every persisted definition", () => {
    const repo = new MetadataRepository(makeDatabase());
    repo.insert(createMetadataDefinition({ name: "A", implementation: "AMetadata" }));
    repo.insert(createMetadataDefinition({ name: "B", implementation: "BMetadata" }));

    expect(repo.all()).toHaveLength(2);
  });

  it("update persists changed fields", () => {
    const repo = new MetadataRepository(makeDatabase());
    const inserted = repo.insert(
      createMetadataDefinition({ name: "A", implementation: "AMetadata", enable: false })
    );

    repo.update({ ...inserted, enable: true });

    expect(repo.get(inserted.id).enable).toBe(true);
  });

  it("delete removes the row", () => {
    const repo = new MetadataRepository(makeDatabase());
    const inserted = repo.insert(
      createMetadataDefinition({ name: "A", implementation: "AMetadata" })
    );

    repo.delete(inserted.id);

    expect(repo.find(inserted.id)).toBeUndefined();
  });

  it("get throws ModelNotFoundException for a missing id", () => {
    const repo = new MetadataRepository(makeDatabase());
    expect(() => repo.get(999)).toThrow();
  });
});
