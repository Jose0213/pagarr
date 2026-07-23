import { beforeEach, describe, expect, it } from "vitest";
import { createIndexerStatus, type IndexerStatus } from "../IndexerStatus.js";
import type { IIndexerStatusRepository } from "../IndexerStatusRepository.js";
import { IndexerStatusService, type IndexerStatusServiceClock } from "../IndexerStatusService.js";

function inMemoryRepository(): IIndexerStatusRepository & { store: Map<number, IndexerStatus> } {
  const store = new Map<number, IndexerStatus>();
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

// Well past the 15-minute startup grace period by default, so RecordFailure's
// escalation branch isn't clamped by the "just started" special case unless
// a test explicitly wants to exercise it. Anchored to the real wall clock
// (Date.now()) rather than an arbitrary fixed epoch, since
// `isIndexerStatusDisabled()` (IndexerStatus.ts, used by
// `getBlockedProviders()`) reads `Date.now()` directly -- matching the C#
// original's `ProviderStatusBase.IsDisabled()`, which also compares against
// `DateTime.UtcNow` rather than the injected `IRuntimeInfo` clock. Only
// `RecordFailure`'s startup-grace-period check uses the injected clock in
// both the original and this port.
function farPastStartupClock(): IndexerStatusServiceClock {
  const nowMs = Date.now();
  return { now: () => nowMs, startTimeMs: nowMs - 60 * 60 * 1000 };
}

describe("IndexerStatusService", () => {
  let repository: ReturnType<typeof inMemoryRepository>;
  let service: IndexerStatusService;

  beforeEach(() => {
    repository = inMemoryRepository();
    service = new IndexerStatusService(repository, farPastStartupClock());
  });

  it("recordFailure() on a fresh provider sets escalationLevel to 1 without escalating further", () => {
    service.recordFailure(1);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(1);
    expect(status.disabledTill).not.toBeNull();
  });

  it("recordFailure() called again escalates the level further", () => {
    service.recordFailure(1);
    service.recordFailure(1);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(2);
  });

  it("recordSuccess() decrements escalationLevel and clears disabledTill", () => {
    service.recordFailure(1);
    service.recordFailure(1);
    expect(repository.findByProviderId(1)!.escalationLevel).toBe(2);

    service.recordSuccess(1);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(1);
    expect(status.disabledTill).toBeNull();
  });

  it("recordSuccess() on an already-healthy (level 0) provider is a no-op", () => {
    service.recordSuccess(1);
    expect(repository.findByProviderId(1)).toBeUndefined();
  });

  it("recordConnectionFailure() does not escalate beyond level 1 on a single call", () => {
    service.recordConnectionFailure(1);
    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(1);
  });

  it("getBlockedProviders() returns only providers whose disabledTill is in the future", () => {
    service.recordFailure(1);

    const blocked = service.getBlockedProviders();
    expect(blocked.map((s) => s.providerId)).toEqual([1]);
  });

  it("getBlockedProviders() excludes a provider whose disabledTill has already passed", () => {
    // isIndexerStatusDisabled() (used by getBlockedProviders()) always
    // compares against the real wall clock (see farPastStartupClock's doc
    // comment), so a status upserted directly with a past disabledTill is
    // enough to exercise the "already expired" branch -- no fake "later"
    // service/clock needed.
    repository.upsert(
      createIndexerStatus({
        providerId: 1,
        disabledTill: new Date(Date.now() - 1000).toISOString(),
      })
    );

    expect(service.getBlockedProviders()).toEqual([]);
  });

  it("providerId <= 0 is a no-op for recordSuccess/recordFailure/recordConnectionFailure", () => {
    service.recordFailure(0);
    service.recordSuccess(-1);
    service.recordConnectionFailure(0);
    expect(repository.all()).toEqual([]);
  });

  it("updateRssSyncStatus()/getLastRssSyncReleaseInfo() round-trip a release", () => {
    const release = { guid: "abc", title: "Test", publishDate: new Date().toISOString() } as never;
    service.updateRssSyncStatus(1, release);

    expect(service.getLastRssSyncReleaseInfo(1)).toEqual(release);
  });

  it("getLastRssSyncReleaseInfo() returns null when no status exists yet", () => {
    expect(service.getLastRssSyncReleaseInfo(42)).toBeNull();
  });

  it("recordFailure() with an explicit minimumBackOffMs escalates until the backoff period is met", () => {
    // 5-minute period is level 2 (0, 60s, 5min, ...) -- a fresh failure
    // should escalate straight past level 1 to satisfy a 5-minute minimum.
    service.recordFailure(1, 5 * 60 * 1000);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBeGreaterThanOrEqual(2);
  });

  it("respects createIndexerStatus()'s IsDisabled semantics used elsewhere", () => {
    const status = createIndexerStatus({
      disabledTill: new Date(Date.now() + 10_000).toISOString(),
    });
    expect(status.disabledTill).not.toBeNull();
  });
});
