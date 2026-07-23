import { beforeEach, describe, expect, it, vi } from "vitest";
import { Quality } from "../quality.js";
import { newQualityDefinition, type QualityDefinition } from "../qualityDefinition.js";
import { QualityDefinitionService } from "../qualityDefinitionService.js";
import type { IQualityDefinitionRepository } from "../qualityDefinitionRepository.js";
import { newResetQualityDefinitionsCommand } from "../commands/resetQualityDefinitionsCommand.js";

/** Minimal in-memory fake standing in for the real repo, mirroring the C# Mocker.GetMock<IQualityDefinitionRepository>() setup. */
function makeFakeRepo(seed: QualityDefinition[] = []): IQualityDefinitionRepository {
  let rows = [...seed];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  return {
    all: vi.fn(() => rows.map((r) => ({ ...r }))),
    get: vi.fn((id: number) => {
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error("not found");
      return found;
    }),
    find: vi.fn((id: number) => rows.find((r) => r.id === id)),
    insert: vi.fn((model: QualityDefinition) => {
      const inserted = { ...model, id: nextId++ };
      rows.push(inserted);
      return inserted;
    }),
    insertMany: vi.fn((models: QualityDefinition[]) => {
      const inserted = models.map((m) => ({ ...m, id: nextId++ }));
      rows.push(...inserted);
      return inserted;
    }),
    update: vi.fn((model: QualityDefinition) => {
      rows = rows.map((r) => (r.id === model.id ? model : r));
      return model;
    }),
    updateMany: vi.fn((models: QualityDefinition[]) => {
      for (const m of models) {
        rows = rows.map((r) => (r.id === m.id ? m : r));
      }
    }),
    delete: vi.fn(),
    deleteMany: vi.fn((modelsOrIds: QualityDefinition[] | number[]) => {
      const ids =
        modelsOrIds.length > 0 && typeof modelsOrIds[0] === "number"
          ? (modelsOrIds as number[])
          : (modelsOrIds as QualityDefinition[]).map((m) => m.id);
      rows = rows.filter((r) => !ids.includes(r.id));
    }),
    count: vi.fn(() => rows.length),
  };
}

// Translated from NzbDrone.Core.Test/Qualities/QualityDefinitionServiceFixture.cs

describe("QualityDefinitionService.handleApplicationStarted (Handle(ApplicationStartedEvent))", () => {
  it("init should add all definitions when the repo starts empty", () => {
    const repo = makeFakeRepo([]);
    const service = new QualityDefinitionService(repo);

    service.handleApplicationStarted();

    expect(repo.insertMany).toHaveBeenCalledTimes(1);
    const insertedArg = vi.mocked(repo.insertMany).mock.calls[0]![0];
    expect(insertedArg).toHaveLength(Quality.All.length);
  });

  it("init should insert any missing definitions", () => {
    const repo = makeFakeRepo([
      newQualityDefinition(Quality.MP3, { weight: 1, minSize: 0, maxSize: 100, id: 20 }),
    ]);
    const service = new QualityDefinitionService(repo);

    service.handleApplicationStarted();

    const insertedArg = vi.mocked(repo.insertMany).mock.calls[0]![0];
    expect(insertedArg).toHaveLength(Quality.All.length - 1);
  });

  it("init should update existing definitions", () => {
    const repo = makeFakeRepo([
      newQualityDefinition(Quality.MP3, { weight: 1, minSize: 0, maxSize: 100, id: 20 }),
    ]);
    const service = new QualityDefinitionService(repo);

    service.handleApplicationStarted();

    const updatedArg = vi.mocked(repo.updateMany).mock.calls[0]![0];
    expect(updatedArg).toHaveLength(1);
  });

  it("init should remove old definitions no longer in the default set", () => {
    const repo = makeFakeRepo([
      newQualityDefinition({ id: 100, name: "Test" }, { weight: 1, minSize: 0, maxSize: 100, id: 20 }),
    ]);
    const service = new QualityDefinitionService(repo);

    service.handleApplicationStarted();

    const deletedArg = vi.mocked(repo.deleteMany).mock.calls[0]![0];
    expect(deletedArg).toHaveLength(1);
  });
});

describe("QualityDefinitionService reads", () => {
  let repo: IQualityDefinitionRepository;
  let service: QualityDefinitionService;

  beforeEach(() => {
    repo = makeFakeRepo([
      newQualityDefinition(Quality.MOBI, { minSize: 0, maxSize: 350, id: 1 }),
      newQualityDefinition(Quality.EPUB, { minSize: 0, maxSize: 350, id: 2 }),
      newQualityDefinition(Quality.FLAC, { minSize: 0, maxSize: null, id: 3 }),
    ]);
    service = new QualityDefinitionService(repo);
  });

  it("all() returns definitions ordered by (recomputed) Weight, ascending", () => {
    const all = service.all();
    expect(all.map((d) => d.quality.id)).toEqual([Quality.MOBI.id, Quality.EPUB.id, Quality.FLAC.id]);
    expect(all.map((d) => d.weight)).toEqual([10, 11, 110]);
  });

  it("get(quality) returns the definition with weight filled in from Quality.DefaultQualityDefinitions", () => {
    const definition = service.get(Quality.FLAC);
    expect(definition.weight).toBe(110);
    expect(definition.id).toBe(3);
  });

  it("get(quality) throws for a quality with no stored row", () => {
    expect(() => service.get(Quality.PDF)).toThrow();
  });

  it("getById(id) returns the matching definition", () => {
    const definition = service.getById(2);
    expect(definition.quality).toEqual(Quality.EPUB);
  });

  it("getById(id) throws for an id with no match", () => {
    expect(() => service.getById(999)).toThrow();
  });

  it("caches reads for up to 5 seconds without re-querying the repo", () => {
    service.all();
    service.all();
    service.get(Quality.MOBI);

    // repo.all() backs GetAll(); should only be called once across all three reads.
    expect(repo.all).toHaveBeenCalledTimes(1);
  });

  it("update() clears the cache so the next read re-queries the repo", () => {
    service.all();
    expect(repo.all).toHaveBeenCalledTimes(1);

    service.update({ ...service.getById(1), title: "New Title" });

    service.all();
    expect(repo.all).toHaveBeenCalledTimes(2);
  });

  it(
    "updateMany() does NOT clear the cache -- faithfully reproduced C# quirk " +
      "(see qualityDefinitionService.ts's deviation note on updateMany)",
    () => {
      service.all();
      expect(repo.all).toHaveBeenCalledTimes(1);

      service.updateMany([{ ...service.getById(1), title: "New Title" }]);

      service.all();
      // Still 1: the stale cache from before updateMany() was reused.
      expect(repo.all).toHaveBeenCalledTimes(1);
    }
  );
});

describe("QualityDefinitionService.execute (Execute(ResetQualityDefinitionsCommand))", () => {
  it("resets MinSize/MaxSize for every default-set definition, keeps Title when resetTitles is false", () => {
    const repo = makeFakeRepo([
      newQualityDefinition(Quality.MOBI, { minSize: 999, maxSize: 999, title: "Custom Title", id: 1 }),
    ]);
    // Seed the rest of the default set too, since execute() throws if any default quality has no row.
    for (const definition of Quality.DefaultQualityDefinitions) {
      if (definition.quality.id !== Quality.MOBI.id) {
        repo.insert(definition);
      }
    }
    const service = new QualityDefinitionService(repo);

    service.execute(newResetQualityDefinitionsCommand(false));

    const mobiRow = repo.find(1)!;
    expect(mobiRow.minSize).toBe(0);
    expect(mobiRow.maxSize).toBe(350);
    expect(mobiRow.title).toBe("Custom Title");
  });

  it("resets Title too when resetTitles is true", () => {
    const repo = makeFakeRepo([
      newQualityDefinition(Quality.MOBI, { minSize: 999, maxSize: 999, title: "Custom Title", id: 1 }),
    ]);
    for (const definition of Quality.DefaultQualityDefinitions) {
      if (definition.quality.id !== Quality.MOBI.id) {
        repo.insert(definition);
      }
    }
    const service = new QualityDefinitionService(repo);

    service.execute(newResetQualityDefinitionsCommand(true));

    const mobiRow = repo.find(1)!;
    expect(mobiRow.title).toBe("MOBI");
  });

  it("throws if a default-set quality has no existing row (faithful port of the C# SingleOrDefault-then-dereference bug)", () => {
    const repo = makeFakeRepo([]);
    const service = new QualityDefinitionService(repo);

    expect(() => service.execute(newResetQualityDefinitionsCommand())).toThrow();
  });
});
