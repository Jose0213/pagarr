import { beforeEach, describe, expect, it } from "vitest";
import type { IImportListStatusRepository } from "../ImportListStatusRepository.js";
import { ImportListStatusService } from "../ImportListStatusService.js";
import { createImportListStatus, type ImportListStatus } from "../ImportListStatus.js";
import type { ProviderStatusServiceClock } from "../../thingi-provider/status/ProviderStatusServiceBase.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/ImportListStatusServiceFixture.cs
 * (the ImportLists-specific additions on top of the base
 * `ProviderStatusServiceBase` -- the base's own backoff-escalation behavior
 * is already covered by `thingi-provider/__tests__/ProviderStatusServiceBase.test.ts`,
 * which `ImportListStatusService` inherits unmodified since its constructor
 * doesn't override `maximumEscalationLevel`/`minimumTimeSinceInitialFailureMs`
 * -- unlike Notifications/DownloadClients, matching `IndexerStatusService`'s
 * identical "no overrides" choice per this file's own doc comment).
 */
function inMemoryRepository(): IImportListStatusRepository & {
  store: Map<number, ImportListStatus>;
} {
  const store = new Map<number, ImportListStatus>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    findByProviderId: (providerId) => [...store.values()].find((s) => s.providerId === providerId),
    upsert: (model) => {
      const withId = model.id === 0 ? { ...model, id: nextId++ } : model;
      store.set(withId.id, withId);
      return withId;
    },
    deleteByProviderId: (providerId) => {
      for (const [id, status] of store) {
        if (status.providerId === providerId) {
          store.delete(id);
        }
      }
    },
  };
}

describe("ImportListStatusService", () => {
  let repository: ReturnType<typeof inMemoryRepository>;
  let service: ImportListStatusService;
  let epochMs: number;

  beforeEach(() => {
    epochMs = Date.now();
    repository = inMemoryRepository();
    const clock: ProviderStatusServiceClock = {
      now: () => epochMs,
      startTimeMs: epochMs - 60 * 60 * 1000,
    };
    service = new ImportListStatusService(repository, clock);
  });

  it("getLastSyncListInfo returns null for a provider with no recorded status", () => {
    expect(service.getLastSyncListInfo(42)).toBeNull();
  });

  it("updateListSyncStatus stamps LastInfoSync with the current time and persists it", () => {
    service.updateListSyncStatus(42);

    const status = repository.findByProviderId(42);
    expect(status).toBeDefined();
    expect(status?.lastInfoSync).toBe(new Date(epochMs).toISOString());
    expect(service.getLastSyncListInfo(42)).toBe(new Date(epochMs).toISOString());
  });

  it("updateListSyncStatus on an already-tracked provider preserves its escalation state", () => {
    repository.upsert(createImportListStatus({ providerId: 5, escalationLevel: 3 }));

    service.updateListSyncStatus(5);

    const status = repository.findByProviderId(5);
    expect(status?.escalationLevel).toBe(3);
    expect(status?.lastInfoSync).toBe(new Date(epochMs).toISOString());
  });

  it("recordFailure then recordSuccess still de-escalates as the base class provides", () => {
    service.recordFailure(11);
    expect(repository.findByProviderId(11)?.escalationLevel).toBe(1);

    service.recordSuccess(11);
    expect(repository.findByProviderId(11)?.escalationLevel).toBe(0);
  });
});
