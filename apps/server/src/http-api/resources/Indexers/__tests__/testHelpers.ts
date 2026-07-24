import { vi } from "vitest";
import type {
  IIndexer,
  IIndexerRepository,
  IndexerDefinition,
} from "../../../../indexers/index.js";
import { createIndexerDefinition } from "../../../../indexers/index.js";
import type { IIndexerStatusService } from "../../../../indexers/IndexerStatusService.js";
import { createIndexerStatus } from "../../../../indexers/IndexerStatus.js";
import {
  createNewznabSettings,
  type NewznabSettings,
} from "../../../../indexers/newznab/newznabSettings.js";
import { IndexerFactory } from "../../../../indexers/IndexerFactory.js";

/** Shared test fakes for the Indexers resource-group test suites. */

export function fakeIndexerStatusService(blocked: number[] = []): IIndexerStatusService {
  return {
    getBlockedProviders: vi.fn(() => blocked.map((id) => createIndexerStatus({ providerId: id }))),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastRssSyncReleaseInfo: vi.fn(() => null),
    updateRssSyncStatus: vi.fn(),
  };
}

export function inMemoryIndexerRepository(): IIndexerRepository {
  const store = new Map<number, IndexerDefinition>();
  let nextId = 1;

  return {
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => {
      const found = store.get(id);
      if (!found) {
        throw new Error(`not found: ${id}`);
      }
      return found;
    },
    getMany: (ids) => ids.map((id) => store.get(id)).filter((v): v is IndexerDefinition => !!v),
    findByName: (name) => [...store.values()].find((d) => d.name === name),
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    upsert: (model) => {
      if (model.id === 0) {
        const withId = { ...model, id: nextId++ };
        store.set(withId.id, withId);
        return withId;
      }
      store.set(model.id, model);
      return model;
    },
    delete: (id) => {
      store.delete(id);
    },
    count: () => store.size,
  };
}

/** A minimal, real-shaped fake "Newznab" `IIndexer` -- avoids depending on the real HTTP-backed `Newznab` class (network calls) in these HTTP-layer tests. */
export function fakeNewznabIndexer(
  overrides: Partial<IIndexer> = {},
  definition: IndexerDefinition = createIndexerDefinition({
    implementation: "Newznab",
    configContract: "NewznabSettings",
    settings: createNewznabSettings(),
  })
): IIndexer {
  return {
    name: "Newznab",
    supportsRss: true,
    supportsSearch: true,
    protocol: 1,
    definition,
    fetchRecent: vi.fn(async () => []),
    fetch: vi.fn(async () => []),
    getDownloadRequest: vi.fn(),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(() => ({ ok: true })),
    ...overrides,
  } as unknown as IIndexer;
}

export function buildIndexerFactory(
  indexers: IIndexer[],
  statusService: IIndexerStatusService = fakeIndexerStatusService()
): IndexerFactory {
  return new IndexerFactory(statusService, indexers);
}

export function validIndexerBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: "My Newznab",
    implementation: "Newznab",
    configContract: "NewznabSettings",
    tags: [],
    priority: 25,
    enableRss: true,
    enableAutomaticSearch: true,
    enableInteractiveSearch: true,
    downloadClientId: 0,
    fields: [
      { name: "baseUrl", value: "https://example.com" },
      { name: "apiPath", value: "/api" },
      { name: "apiKey", value: "abc123" },
      { name: "categories", value: [3030] },
    ],
    ...overrides,
  };
}

export type { NewznabSettings };
