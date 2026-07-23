import { ESCALATION_BACKOFF_PERIODS_SECONDS } from "../../thingi-provider/status/EscalationBackOff.js";
import type { ProviderStatusBase } from "../../thingi-provider/status/ProviderStatusBase.js";
import type { IProviderStatusRepositoryLike } from "../../thingi-provider/status/ProviderStatusServiceBase.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureProviderStatusTimes.cs.
 *
 * Generic base for the four `FixFuture*StatusTimes` housekeepers (Indexer,
 * DownloadClient, ImportList, Notification). Clamps any provider-status
 * row's `disabledTill`/`initialFailure`/`mostRecentFailure` timestamps that
 * are in the future (relative to "now") back down -- guards against clock
 * skew (e.g. a system clock that was set wrong, then corrected) leaving a
 * provider disabled far longer than intended, or history timestamps that
 * predate "now" but were stored as future dates.
 *
 * Uses the real shared `IProviderStatusRepositoryLike<TModel>` /
 * `ProviderStatusBase` from the now-ported ThingiProvider module (see
 * `thingi-provider/status/ProviderStatusServiceBase.ts`) rather than a
 * local forward-ref -- this is the same generic base type
 * `DownloadClientStatusRepository`/`IndexerStatusRepository` already
 * satisfy structurally (`all()`/`findByProviderId()`/`upsert()`/
 * `deleteByProviderId()`).
 *
 * PRESERVED C# BUG -- unit mismatch: `EscalationBackOff.Periods[level]` is
 * defined and consumed everywhere else (`ProviderStatusServiceBase.cs`'s
 * `CalculateBackOffPeriod`) as a count of *seconds*
 * (`TimeSpan.FromSeconds(...)`, see EscalationBackOff.ts's doc comment).
 * This file's real C# source instead does `now.AddMinutes(escalationDelay)`
 * -- treating that same seconds value as *minutes*. That is a genuine bug
 * in the original Readarr source (verified: `ProviderStatusServiceBase.cs`
 * line 57 vs `FixFutureProviderStatusTimes.cs` line 28), not a porting
 * error -- ported here as `addMinutes(now, periodSeconds)` to faithfully
 * reproduce the same (too-generous) clamp ceiling the C# original produces,
 * rather than "fixing" it to `addSeconds`.
 *
 * `updateMany` doesn't exist on `IProviderStatusRepositoryLike` (unlike
 * `BasicRepository<TModel>`'s batched `updateMany`) -- the C# original's
 * `_repo.UpdateMany(toUpdate)` is a single batched SQL UPDATE; this port
 * calls `upsert()` once per changed row instead (`IProviderStatusRepositoryLike`
 * only exposes `upsert`, not a batch-update variant), which produces the
 * same end-state (each such row already has `id > 0`, so `upsert` performs
 * an UPDATE, not an INSERT) at the cost of N round-trips instead of one
 * batched statement -- functionally equivalent for this port's synchronous
 * single-process SQLite access.
 */
export class FixFutureProviderStatusTimes<
  TModel extends ProviderStatusBase,
> implements IHousekeepingTask {
  constructor(private readonly repo: IProviderStatusRepositoryLike<TModel>) {}

  clean(): void {
    const now = Date.now();
    const statuses = this.repo.all();

    for (const status of statuses) {
      let updated = false;

      const escalationDelayMinutes = ESCALATION_BACKOFF_PERIODS_SECONDS[status.escalationLevel]!;
      const disabledTillCeiling = addMinutes(now, escalationDelayMinutes);

      if (
        status.disabledTill !== null &&
        new Date(status.disabledTill).getTime() > disabledTillCeiling
      ) {
        status.disabledTill = new Date(disabledTillCeiling).toISOString();
        updated = true;
      }

      if (status.initialFailure !== null && new Date(status.initialFailure).getTime() > now) {
        status.initialFailure = new Date(now).toISOString();
        updated = true;
      }

      if (status.mostRecentFailure !== null && new Date(status.mostRecentFailure).getTime() > now) {
        status.mostRecentFailure = new Date(now).toISOString();
        updated = true;
      }

      if (updated) {
        this.repo.upsert(status);
      }
    }
  }
}

function addMinutes(epochMs: number, minutes: number): number {
  return epochMs + minutes * 60 * 1000;
}
