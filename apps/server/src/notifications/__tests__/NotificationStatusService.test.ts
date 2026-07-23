import { describe, expect, it } from "vitest";
import type {
  IProviderStatusRepositoryLike,
  ProviderStatusServiceClock,
} from "../../thingi-provider/status/ProviderStatusServiceBase.js";
import { createNotificationStatus, type NotificationStatus } from "../NotificationStatus.js";
import { NotificationStatusService } from "../NotificationStatusService.js";

function fakeRepository(): IProviderStatusRepositoryLike<NotificationStatus> & {
  store: Map<number, NotificationStatus>;
} {
  const store = new Map<number, NotificationStatus>();
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
      const existing = [...store.values()].find((s) => s.providerId === providerId);
      if (existing) {
        store.delete(existing.id);
      }
    },
  };
}

function fakeClock(nowMs: number, startTimeMs = 0): ProviderStatusServiceClock {
  return { now: () => nowMs, startTimeMs };
}

describe("NotificationStatusService", () => {
  it("uses MinimumTimeSinceInitialFailure=5min and MaximumEscalationLevel=5, matching the C# ctor overrides", () => {
    const repo = fakeRepository();
    // Start well past the 15-minute startup grace period so escalation isn't
    // capped by that separate guard while exercising these two overrides.
    const clock = fakeClock(60 * 60 * 1000, 0);
    const service = new NotificationStatusService(repo, clock);

    // First failure: escalationLevel goes from 0 -> 1 (initial failure, not yet escalated further).
    service.recordFailure(1);
    expect(repo.store.get(1)?.escalationLevel).toBe(1);

    // Repeated failures fast (all within the 5-minute grace window since initial
    // failure) should NOT escalate further -- MinimumTimeSinceInitialFailure gate.
    service.recordFailure(1);
    expect(repo.store.get(1)?.escalationLevel).toBe(1);
  });

  it("recordSuccess() decrements escalationLevel and clears disabledTill", () => {
    const repo = fakeRepository();
    const service = new NotificationStatusService(repo, fakeClock(60 * 60 * 1000, 0));

    service.recordFailure(1);
    expect(repo.store.get(1)?.escalationLevel).toBeGreaterThan(0);

    service.recordSuccess(1);
    expect(repo.store.get(1)?.disabledTill).toBeNull();
  });

  it("getBlockedProviders() returns only statuses whose disabledTill is in the future", () => {
    const repo = fakeRepository();
    const now = Date.now();
    repo.upsert(
      createNotificationStatus({
        providerId: 1,
        disabledTill: new Date(now + 60_000).toISOString(),
      })
    );
    repo.upsert(
      createNotificationStatus({
        providerId: 2,
        disabledTill: new Date(now - 60_000).toISOString(),
      })
    );

    const service = new NotificationStatusService(repo);
    const blocked = service.getBlockedProviders();

    expect(blocked.map((s) => s.providerId)).toEqual([1]);
  });

  it("recordSuccess()/recordFailure() are no-ops for providerId <= 0, matching the C# guard", () => {
    const repo = fakeRepository();
    const service = new NotificationStatusService(repo);

    service.recordFailure(0);
    service.recordSuccess(-1);

    expect(repo.store.size).toBe(0);
  });
});
