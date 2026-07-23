import { describe, expect, it, vi } from "vitest";
import { MetadataFactory } from "../metadataFactory.js";
import type { IMetadataRepository } from "../metadataRepository.js";
import { createMetadataDefinition, type MetadataDefinition } from "../metadataDefinition.js";
import type { IMetadata } from "../metadataBase.js";

class FakeKodiMetadata implements Partial<IMetadata> {
  readonly name = "Kodi";
}

class FakeRoksboxMetadata implements Partial<IMetadata> {
  readonly name = "Roksbox";
}

function makeFakeRepository(initial: MetadataDefinition[] = []): IMetadataRepository {
  let rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  return {
    all: () => rows.map((r) => ({ ...r })),
    find: (id) => rows.find((r) => r.id === id),
    get: (id) => {
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error("not found");
      return found;
    },
    getMany: (ids) => rows.filter((r) => ids.includes(r.id)),
    findByName: (name) => rows.find((r) => r.name === name),
    insert: (model) => {
      const inserted = { ...model, id: nextId++ };
      rows.push(inserted);
      return inserted;
    },
    insertMany: (models) => {
      const inserted = models.map((m) => ({ ...m, id: nextId++ }));
      rows.push(...inserted);
      return inserted;
    },
    update: (model) => {
      rows = rows.map((r) => (r.id === model.id ? model : r));
      return model;
    },
    delete: (id) => {
      rows = rows.filter((r) => r.id !== id);
    },
    count: () => rows.length,
  };
}

describe("MetadataFactory.initializeProviders", () => {
  it("inserts a disabled definition for every consumer without an existing row", () => {
    const repo = makeFakeRepository();
    const factory = new MetadataFactory(repo, [
      new FakeKodiMetadata() as unknown as IMetadata,
      new FakeRoksboxMetadata() as unknown as IMetadata,
    ]);

    factory.initializeProviders();

    const all = repo.all();
    expect(all).toHaveLength(2);
    expect(all.every((d) => d.enable === false)).toBe(true);
    expect(all.map((d) => d.implementation).sort()).toEqual([
      "FakeKodiMetadata",
      "FakeRoksboxMetadata",
    ]);
  });

  it("does not duplicate a definition that already exists for that implementation", () => {
    const repo = makeFakeRepository([
      createMetadataDefinition({ name: "Kodi", implementation: "FakeKodiMetadata", enable: true }),
    ]);
    const insertManySpy = vi.spyOn(repo, "insertMany");
    const factory = new MetadataFactory(repo, [new FakeKodiMetadata() as unknown as IMetadata]);

    factory.initializeProviders();

    expect(insertManySpy).not.toHaveBeenCalled();
    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]!.enable).toBe(true);
  });
});

describe("MetadataFactory.enabled", () => {
  it("returns only providers whose definition has Enable = true", () => {
    const repo = makeFakeRepository();
    const kodi = new FakeKodiMetadata() as unknown as IMetadata;
    const roksbox = new FakeRoksboxMetadata() as unknown as IMetadata;
    const factory = new MetadataFactory(repo, [kodi, roksbox]);

    factory.initializeProviders();
    const kodiDef = repo.findByName("Kodi")!;
    repo.update({ ...kodiDef, enable: true });
    factory.initializeProviders();

    const enabled = factory.enabled();

    expect(enabled).toHaveLength(1);
    expect(enabled[0]).toBe(kodi);
  });
});

describe("MetadataFactory.getAvailableProviders", () => {
  it("returns every provider that currently has a persisted definition, enabled or not", () => {
    const repo = makeFakeRepository();
    const kodi = new FakeKodiMetadata() as unknown as IMetadata;
    const roksbox = new FakeRoksboxMetadata() as unknown as IMetadata;
    const factory = new MetadataFactory(repo, [kodi, roksbox]);

    factory.initializeProviders();

    expect(factory.getAvailableProviders()).toHaveLength(2);
  });
});
