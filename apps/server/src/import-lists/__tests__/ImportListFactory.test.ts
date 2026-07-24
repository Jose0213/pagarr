import { describe, expect, it, vi } from "vitest";
import type { IProviderRepository } from "../../thingi-provider/IProviderRepository.js";
import type { IImportListStatusService } from "../ImportListStatusService.js";
import { ImportListFactory } from "../ImportListFactory.js";
import {
  createImportListDefinition,
  ImportListMonitorType,
  type ImportListDefinition,
} from "../ImportListDefinition.js";
import { ImportListType } from "../ImportListType.js";
import type { IImportList } from "../IImportList.js";
import type { IImportListSettings } from "../IImportListSettings.js";
import type { ImportListStatus } from "../ImportListStatus.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/ImportListFactoryFixture.cs.
 */
function validSettings(): IImportListSettings {
  return {
    baseUrl: "http://x",
    validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

function fakeImportList(overrides: Partial<IImportList> = {}): IImportList {
  return {
    name: "FakeList",
    configContract: "FakeSettings",
    message: null,
    defaultDefinitions: [],
    listType: ImportListType.Other,
    minRefreshIntervalMs: 15 * 60 * 1000,
    definition: createImportListDefinition({ name: "FakeList", implementation: "FakeList" }),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
    fetch: vi.fn(async () => []),
    ...overrides,
  };
}

function inMemoryRepository(): IProviderRepository<ImportListDefinition> & {
  store: Map<number, ImportListDefinition>;
} {
  const store = new Map<number, ImportListDefinition>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => {
      const found = store.get(id);
      if (!found) throw new Error(`not found: ${id}`);
      return found;
    },
    getMany: (ids) => ids.map((id) => store.get(id)!).filter(Boolean),
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    updateMany: (models) => {
      for (const m of models) store.set(m.id, m);
    },
    upsert: (model) => {
      const withId = model.id === 0 ? { ...model, id: nextId++ } : model;
      store.set(withId.id, withId);
      return withId;
    },
    delete: (id) => {
      store.delete(id);
    },
    deleteMany: (ids) => {
      for (const id of ids) store.delete(id);
    },
    count: () => store.size,
  };
}

function fakeStatusService(blocked: ImportListStatus[] = []): IImportListStatusService & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: vi.fn(() => blocked),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastSyncListInfo: vi.fn(() => null),
    updateListSyncStatus: vi.fn(),
  };
}

describe("ImportListFactory", () => {
  it("active() ANDs the base's settings-valid filter with EnableAutomaticAdd, matching the real C# Active() override", () => {
    const repo = inMemoryRepository();
    const enabledValidDef = repo.insert(
      createImportListDefinition({
        name: "EnabledValid",
        implementation: "fakelist",
        enableAutomaticAdd: true,
        settings: validSettings(),
      })
    );
    repo.insert(
      createImportListDefinition({
        name: "DisabledValid",
        implementation: "fakelist",
        enableAutomaticAdd: false,
        settings: validSettings(),
      })
    );
    repo.insert(
      createImportListDefinition({
        name: "EnabledInvalid",
        implementation: "fakelist",
        enableAutomaticAdd: true,
        settings: {
          baseUrl: "",
          validate: () => ({
            isValid: false,
            hasWarnings: false,
            errors: [{ propertyName: "x", errorMessage: "bad" }],
          }),
        },
      })
    );

    const provider = fakeImportList({ definition: enabledValidDef });
    const factory = new ImportListFactory(
      fakeStatusService(),
      repo,
      [provider],
      new Map([["fakelist", () => fakeImportList()]])
    );

    const available = factory.getAvailableProviders();
    expect(available).toHaveLength(1);
    expect(available[0]?.definition.name).toBe("EnabledValid");
  });

  it("automaticAddEnabled() filters to definitions with EnableAutomaticAdd set", () => {
    const repo = inMemoryRepository();
    const enabledDef = repo.insert(
      createImportListDefinition({
        name: "Enabled",
        implementation: "fakelist",
        enableAutomaticAdd: true,
        settings: validSettings(),
      })
    );

    const factory = new ImportListFactory(
      fakeStatusService(),
      repo,
      [],
      new Map([["fakelist", () => fakeImportList({ definition: enabledDef })]])
    );

    const result = factory.automaticAddEnabled();
    expect(result).toHaveLength(1);
    expect(result[0]?.definition.name).toBe("Enabled");
  });

  it("automaticAddEnabled() excludes providers blocked by recent failures when filterBlockedImportLists is true (default)", () => {
    const repo = inMemoryRepository();
    const def = repo.insert(
      createImportListDefinition({
        name: "Blocked",
        implementation: "fakelist",
        enableAutomaticAdd: true,
        settings: validSettings(),
      })
    );

    const blockedStatus: ImportListStatus = {
      id: 1,
      providerId: def.id,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 3,
      disabledTill: new Date(Date.now() + 60_000).toISOString(),
      lastInfoSync: null,
    };

    const factory = new ImportListFactory(
      fakeStatusService([blockedStatus]),
      repo,
      [],
      new Map([["fakelist", () => fakeImportList({ definition: def })]])
    );

    expect(factory.automaticAddEnabled()).toHaveLength(0);
    expect(factory.automaticAddEnabled(false)).toHaveLength(1);
  });

  it("setProviderCharacteristicsFor stamps listType/minRefreshIntervalMs from the live provider instance", () => {
    const repo = inMemoryRepository();
    const def = repo.insert(
      createImportListDefinition({
        name: "Stamped",
        implementation: "fakelist",
        settings: validSettings(),
      })
    );

    const factory = new ImportListFactory(
      fakeStatusService(),
      repo,
      [],
      new Map([
        [
          "fakelist",
          () =>
            fakeImportList({
              listType: ImportListType.Goodreads,
              minRefreshIntervalMs: 12 * 60 * 60 * 1000,
            }),
        ],
      ])
    );

    const instance = factory.getInstance(def);
    expect(instance.definition.listType).toBe(ImportListType.Goodreads);
    expect((instance.definition as ImportListDefinition).minRefreshIntervalMs).toBe(
      12 * 60 * 60 * 1000
    );
  });

  it("test() records success/failure on the status service, skipping unsaved (id=0) definitions", async () => {
    const repo = inMemoryRepository();
    const savedDef = repo.insert(
      createImportListDefinition({
        name: "Saved",
        implementation: "fakelist",
        settings: validSettings(),
      })
    );
    const statusService = fakeStatusService();

    const passingTest = vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] }));
    const passingProvider = fakeImportList({ definition: savedDef, test: passingTest });

    const factory = new ImportListFactory(
      statusService,
      repo,
      [passingProvider],
      new Map([["fakelist", () => fakeImportList({ test: passingTest })]])
    );

    await factory.test(savedDef);
    expect(statusService.recordSuccess).toHaveBeenCalledWith(savedDef.id);

    const unsavedDef = createImportListDefinition({
      id: 0,
      name: "Unsaved",
      implementation: "fakelist",
    });
    statusService.recordSuccess.mockClear();
    await factory.test(unsavedDef);
    expect(statusService.recordSuccess).not.toHaveBeenCalled();
  });
});
