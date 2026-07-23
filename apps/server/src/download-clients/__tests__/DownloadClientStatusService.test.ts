import { beforeEach, describe, expect, it } from "vitest";
import type { DownloadClientStatus } from "../DownloadClientStatus.js";
import type { IDownloadClientStatusRepository } from "../DownloadClientStatusRepository.js";
import {
  DownloadClientStatusService,
  type DownloadClientStatusServiceClock,
} from "../DownloadClientStatusService.js";

function inMemoryRepository(): IDownloadClientStatusRepository & {
  store: Map<number, DownloadClientStatus>;
} {
  const store = new Map<number, DownloadClientStatus>();
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

// Anchored well past the 15-minute startup grace period, and to the real
// wall clock rather than a fixed epoch, matching
// indexers/__tests__/IndexerStatusService.test.ts's identical helper (see
// that file's doc comment for why: isDownloadClientStatusDisabled() reads
// Date.now() directly). A mutable `now` is exposed here (unlike that
// Indexers test) because DownloadClientStatusService's own
// MinimumTimeSinceInitialFailure override is 5 minutes (vs. the Indexers
// base class's zero) -- several of this file's tests need to advance past
// that grace period to exercise escalation/backoff at all.
function makeClock(startOffsetMs = 60 * 60 * 1000): DownloadClientStatusServiceClock & {
  advance(ms: number): void;
} {
  let nowMs = Date.now();
  const startTimeMs = nowMs - startOffsetMs;
  return {
    now: () => nowMs,
    startTimeMs,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("DownloadClientStatusService", () => {
  let repository: ReturnType<typeof inMemoryRepository>;
  let clock: ReturnType<typeof makeClock>;
  let service: DownloadClientStatusService;

  beforeEach(() => {
    repository = inMemoryRepository();
    clock = makeClock();
    service = new DownloadClientStatusService(repository, clock);
  });

  it("recordFailure() on a fresh provider sets escalationLevel to 1 without setting disabledTill (within the 5-minute initial-failure grace period)", () => {
    service.recordFailure(1);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(1);
    expect(status.disabledTill).toBeNull();
  });

  it("recordFailure() called again within the 5-minute grace period does not escalate further", () => {
    service.recordFailure(1);
    service.recordFailure(1);

    expect(repository.findByProviderId(1)!.escalationLevel).toBe(1);
  });

  it("recordFailure() escalates once the 5-minute initial-failure grace period has elapsed", () => {
    service.recordFailure(1);
    clock.advance(6 * 60 * 1000);
    service.recordFailure(1);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(2);
    expect(status.disabledTill).not.toBeNull();
  });

  it("recordSuccess() decrements escalationLevel and clears disabledTill", () => {
    service.recordFailure(1);
    clock.advance(6 * 60 * 1000);
    service.recordFailure(1);
    expect(repository.findByProviderId(1)!.escalationLevel).toBe(2);

    service.recordSuccess(1);

    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(1);
    expect(status.disabledTill).toBeNull();
  });

  it("recordSuccess() on a never-failed provider is a no-op", () => {
    service.recordSuccess(1);
    expect(repository.findByProviderId(1)).toBeUndefined();
  });

  it("escalationLevel is capped at 5 (DownloadClientStatusService's own MaximumEscalationLevel override)", () => {
    for (let i = 0; i < 10; i++) {
      service.recordFailure(1);
      clock.advance(25 * 60 * 60 * 1000); // past every backoff period, including the 24h max
    }

    expect(repository.findByProviderId(1)!.escalationLevel).toBeLessThanOrEqual(5);
  });

  it("getBlockedProviders() returns only providers with a future disabledTill", () => {
    service.recordFailure(1);
    clock.advance(6 * 60 * 1000);
    service.recordFailure(1); // now past the grace period, so disabledTill gets set

    service.recordFailure(2);
    service.recordSuccess(2); // clears disabledTill for provider 2

    const blocked = service.getBlockedProviders().map((s) => s.providerId);
    expect(blocked).toContain(1);
    expect(blocked).not.toContain(2);
  });

  it("recordConnectionFailure() sets escalationLevel to 1 on the first call regardless of the escalate flag", () => {
    service.recordConnectionFailure(1);
    const status = repository.findByProviderId(1)!;
    expect(status.escalationLevel).toBe(1);
  });

  it("recordFailure() with a minimumBackOffMs escalates immediately, bypassing the initial-failure grace period", () => {
    service.recordFailure(1);
    // Second call still within the 5-minute grace period, but a non-zero
    // minimumBackOffMs forces DisabledTill to be (re)computed regardless.
    service.recordFailure(1, 10 * 60 * 1000);

    const status = repository.findByProviderId(1)!;
    expect(status.disabledTill).not.toBeNull();
  });

  it("ignores providerId <= 0", () => {
    service.recordFailure(0);
    service.recordFailure(-1);
    expect(repository.all()).toHaveLength(0);
  });
});
