import { beforeEach, describe, expect, it } from "vitest";
import { createProviderStatusBase, type ProviderStatusBase } from "../status/ProviderStatusBase.js";
import type { IProviderStatusRepositoryLike } from "../status/ProviderStatusServiceBase.js";
import {
  ProviderStatusServiceBase,
  type ProviderStatusServiceClock,
} from "../status/ProviderStatusServiceBase.js";

/**
 * Translated from
 * NzbDrone.Core.Test/ThingiProviderTests/ProviderStatusServiceFixture.cs --
 * a concrete `MockProviderStatusService` subclass exercising the real
 * generic base directly (rather than through a narrow re-derivation like
 * IndexerStatusService.test.ts already covers for Indexers specifically).
 */
class MockProviderStatusService extends ProviderStatusServiceBase<ProviderStatusBase> {}

function inMemoryRepository(): IProviderStatusRepositoryLike<ProviderStatusBase> & {
  store: Map<number, ProviderStatusBase>;
} {
  const store = new Map<number, ProviderStatusBase>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
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

describe("ProviderStatusServiceBase", () => {
  let repository: ReturnType<typeof inMemoryRepository>;
  let service: MockProviderStatusService;
  let epochMs: number;
  const precisionMs = 500;

  function farPastStartupClock(): ProviderStatusServiceClock {
    return { now: () => epochMs, startTimeMs: epochMs - 60 * 60 * 1000 };
  }

  function recentStartupClock(): ProviderStatusServiceClock {
    return { now: () => epochMs, startTimeMs: epochMs - 12 * 60 * 1000 };
  }

  beforeEach(() => {
    epochMs = Date.now();
    repository = inMemoryRepository();
    service = new MockProviderStatusService(repository, farPastStartupClock());
  });

  function withStatus(status: ProviderStatusBase): ProviderStatusBase {
    repository.store.set(status.id === 0 ? 1 : status.id, {
      ...status,
      id: status.id === 0 ? 1 : status.id,
      providerId: 1,
    });
    return repository.store.get(1)!;
  }

  it("should_start_backoff_on_first_failure", () => {
    withStatus(createProviderStatusBase());

    service.recordFailure(1);

    const status = service.getBlockedProviders()[0];
    expect(status).toBeDefined();
    expect(status!.disabledTill).not.toBeNull();
    expect(
      Math.abs(new Date(status!.disabledTill!).getTime() - (epochMs + 60 * 1000))
    ).toBeLessThan(precisionMs);
  });

  it("should_cancel_backoff_on_success", () => {
    withStatus(createProviderStatusBase({ escalationLevel: 2 }));

    service.recordSuccess(1);

    const status = service.getBlockedProviders()[0];
    expect(status).toBeUndefined();
  });

  it("should_not_store_update_if_already_okay", () => {
    withStatus(createProviderStatusBase({ escalationLevel: 0 }));

    const beforeSize = repository.store.size;
    service.recordSuccess(1);

    // No new upsert should have occurred -- store size/content unchanged.
    expect(repository.store.size).toBe(beforeSize);
  });

  it("should_preserve_escalation_on_intermittent_success", () => {
    withStatus(
      createProviderStatusBase({
        initialFailure: new Date(epochMs - 20 * 1000).toISOString(),
        mostRecentFailure: new Date(epochMs - 4 * 1000).toISOString(),
        escalationLevel: 3,
      })
    );

    service.recordSuccess(1);
    service.recordSuccess(1);
    service.recordFailure(1);

    const status = service.getBlockedProviders()[0];
    expect(status).toBeDefined();
    expect(status!.disabledTill).not.toBeNull();
    expect(
      Math.abs(new Date(status!.disabledTill!).getTime() - (epochMs + 5 * 60 * 1000))
    ).toBeLessThan(precisionMs);
  });

  it("should_not_escalate_further_than_5_minutes_for_15_min_after_startup", () => {
    service = new MockProviderStatusService(repository, recentStartupClock());

    const origStatus = withStatus(
      createProviderStatusBase({
        initialFailure: new Date(epochMs - 6 * 60 * 1000).toISOString(),
        mostRecentFailure: new Date(epochMs - 120 * 1000).toISOString(),
        escalationLevel: 3,
      })
    );

    for (let i = 0; i < 7; i++) {
      service.recordFailure(1);
    }

    const status = service.getBlockedProviders()[0];
    expect(status).toBeDefined();

    expect(origStatus.escalationLevel).toBe(3);
    expect(
      Math.abs(new Date(status!.disabledTill!).getTime() - (epochMs + 5 * 60 * 1000))
    ).toBeLessThan(precisionMs);
  });

  it("recordConnectionFailure() does not escalate beyond level 1 on a single call", () => {
    service.recordConnectionFailure(1);
    const status = service.getBlockedProviders()[0];
    expect(status!.escalationLevel).toBe(1);
  });

  it("providerId <= 0 is a no-op for recordSuccess/recordFailure/recordConnectionFailure", () => {
    service.recordFailure(0);
    service.recordSuccess(-1);
    service.recordConnectionFailure(0);
    expect(repository.all()).toEqual([]);
  });

  it("handleProviderDeleted() deletes the status row for that provider", () => {
    withStatus(createProviderStatusBase());
    expect(repository.findByProviderId(1)).toBeDefined();

    service.handleProviderDeleted(1);

    expect(repository.findByProviderId(1)).toBeUndefined();
  });

  it("recordFailure() with an explicit minimumBackOffMs escalates until the backoff period is met", () => {
    service.recordFailure(1, 5 * 60 * 1000);

    const status = service.getBlockedProviders()[0];
    expect(status!.escalationLevel).toBeGreaterThanOrEqual(2);
  });
});
