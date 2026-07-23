import { describe, expect, it } from "vitest";
import { FixFutureProviderStatusTimes } from "../housekeepers/fixFutureProviderStatusTimes.js";
import {
  createProviderStatusBase,
  type ProviderStatusBase,
} from "../../thingi-provider/status/ProviderStatusBase.js";
import type { IProviderStatusRepositoryLike } from "../../thingi-provider/status/ProviderStatusServiceBase.js";
import { ESCALATION_BACKOFF_PERIODS_SECONDS } from "../../thingi-provider/status/EscalationBackOff.js";

function makeRepo(initial: ProviderStatusBase[]): {
  repo: IProviderStatusRepositoryLike<ProviderStatusBase>;
  upserted: ProviderStatusBase[];
} {
  const rows = new Map(initial.map((s) => [s.id, s]));
  const upserted: ProviderStatusBase[] = [];
  const repo: IProviderStatusRepositoryLike<ProviderStatusBase> = {
    all: () => Array.from(rows.values()),
    findByProviderId: (providerId) =>
      Array.from(rows.values()).find((s) => s.providerId === providerId),
    upsert: (model) => {
      upserted.push(model);
      rows.set(model.id, model);
      return model;
    },
    deleteByProviderId: (providerId) => {
      for (const [id, s] of rows) {
        if (s.providerId === providerId) {
          rows.delete(id);
        }
      }
    },
  };
  return { repo, upserted };
}

/**
 * Translated from NzbDrone.Core.Test/HousekeepingTests/FixFutureProviderStatusTimesFixture.cs's
 * intent -- clamps future timestamps, preserving the real C# unit-mismatch
 * bug (AddMinutes applied to what's everywhere else a seconds value). See
 * fixFutureProviderStatusTimes.ts's doc comment.
 */
describe("FixFutureProviderStatusTimes", () => {
  it("clamps a disabledTill further in the future than the escalation-level ceiling back down", () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const status = createProviderStatusBase({
      id: 1,
      providerId: 1,
      escalationLevel: 1,
      disabledTill: farFuture,
    });
    const { repo, upserted } = makeRepo([status]);

    new FixFutureProviderStatusTimes(repo).clean();

    expect(upserted).toHaveLength(1);
    const updated = upserted[0]!;
    expect(new Date(updated.disabledTill!).getTime()).toBeLessThan(new Date(farFuture).getTime());

    // PRESERVED BUG: the ceiling is computed via AddMinutes(periodSeconds), not
    // AddSeconds -- so the clamp ceiling is periodSeconds *minutes* from now,
    // not periodSeconds *seconds* from now (which is what every other consumer
    // of EscalationBackOff.Periods treats that array as).
    const periodMinutes = ESCALATION_BACKOFF_PERIODS_SECONDS[1]!;
    const expectedCeilingMs = Date.now() + periodMinutes * 60 * 1000;
    expect(new Date(updated.disabledTill!).getTime()).toBeLessThanOrEqual(expectedCeilingMs + 5000);
    expect(new Date(updated.disabledTill!).getTime()).toBeGreaterThan(expectedCeilingMs - 5000);
  });

  it("leaves a disabledTill within the escalation ceiling untouched (no upsert call)", () => {
    // Ceiling = now + AddMinutes(ESCALATION_BACKOFF_PERIODS_SECONDS[escalationLevel])
    // (preserved bug -- see class doc comment). At escalation level 2 that's
    // 5 minutes from now; a disabledTill just 1 second out is comfortably
    // within that ceiling regardless of the unit-mismatch bug.
    const soon = new Date(Date.now() + 1000).toISOString();
    const status = createProviderStatusBase({
      id: 1,
      providerId: 1,
      escalationLevel: 2,
      disabledTill: soon,
    });
    const { repo, upserted } = makeRepo([status]);

    new FixFutureProviderStatusTimes(repo).clean();

    expect(upserted).toHaveLength(0);
  });

  it("clamps a future initialFailure and mostRecentFailure down to now", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const status = createProviderStatusBase({
      id: 1,
      providerId: 1,
      initialFailure: future,
      mostRecentFailure: future,
    });
    const { repo, upserted } = makeRepo([status]);

    new FixFutureProviderStatusTimes(repo).clean();

    expect(upserted).toHaveLength(1);
    const updated = upserted[0]!;
    expect(new Date(updated.initialFailure!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(updated.mostRecentFailure!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("leaves null timestamps alone and doesn't upsert a row with nothing to fix", () => {
    const status = createProviderStatusBase({ id: 1, providerId: 1 });
    const { repo, upserted } = makeRepo([status]);

    new FixFutureProviderStatusTimes(repo).clean();

    expect(upserted).toHaveLength(0);
  });
});
