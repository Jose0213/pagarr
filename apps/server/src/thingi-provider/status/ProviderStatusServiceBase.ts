import { ESCALATION_BACKOFF_PERIODS_SECONDS } from "./EscalationBackOff.js";
import { createProviderStatusBase, isProviderStatusDisabled } from "./ProviderStatusBase.js";
import type { ProviderStatusBase } from "./ProviderStatusBase.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusServiceBase.cs's
 * `IProviderStatusServiceBase<TModel>` interface.
 */
export interface IProviderStatusServiceBase<
  TModel extends ProviderStatusBase = ProviderStatusBase,
> {
  getBlockedProviders(): TModel[];
  recordSuccess(providerId: number): void;
  /** `minimumBackOffMs` mirrors C#'s `TimeSpan minimumBackOff = default` (0 = TimeSpan.Zero). */
  recordFailure(providerId: number, minimumBackOffMs?: number): void;
  recordConnectionFailure(providerId: number): void;
}

/** Minimal repository surface this base needs -- matches ProviderStatusRepository.ts's shape. */
export interface IProviderStatusRepositoryLike<TModel extends ProviderStatusBase> {
  all(): TModel[];
  findByProviderId(providerId: number): TModel | undefined;
  upsert(model: TModel): TModel;
  deleteByProviderId(providerId: number): void;
}

/** Minimal clock/runtime-info seam so tests can control "now" and startup time, matching IRuntimeInfo.StartTime. */
export interface ProviderStatusServiceClock {
  now(): number;
  startTimeMs: number;
}

const realClock: ProviderStatusServiceClock = {
  now: () => Date.now(),
  startTimeMs: Date.now(),
};

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusServiceBase.cs.
 *
 * This is the real generic base `IndexerStatusService` and
 * `DownloadClientStatusService` were each independently modeled after --
 * both siblings collapsed the generic base directly into their own
 * concrete class (see e.g. `indexers/IndexerStatusService.ts`'s doc comment:
 * "C#'s ProviderStatusServiceBase<TProvider, TModel> generic base... is
 * collapsed directly into this Indexers-specific class"). They are NOT
 * retrofitted to extend this base (out of scope per this task's brief);
 * this is the real base for Notifications (or any future provider-kind
 * module) to extend.
 *
 * A concrete subclass overrides `maximumEscalationLevel` /
 * `minimumTimeSinceInitialFailureMs` / `minimumTimeSinceStartupMs` in its
 * constructor the same way `DownloadClientStatusService` overrides two of
 * them (`MinimumTimeSinceInitialFailure = 5min`, `MaximumEscalationLevel =
 * 5`) while `IndexerStatusService` leaves all three at the base's own
 * defaults -- both are reproducible by a subclass of this base reassigning
 * the protected fields in its own constructor, matching the C# subclass
 * pattern exactly.
 *
 * The C# `lock (_syncRoot)` around RecordSuccess/RecordFailure (thread-safety
 * for concurrent provider calls) has no Node equivalent/need here -- same
 * omission the two siblings already documented.
 *
 * `HandleAsync(ProviderDeletedEvent<TProvider>)` (auto-deleting a status row
 * when its provider is deleted) is ported as a plain `handleProviderDeleted()`
 * method rather than wired to an event bus, since Messaging/IEventAggregator
 * hasn't landed -- callers invoke it directly (or a future event-bus
 * integration calls it from a subscribed handler) the same way
 * `db/basic-repository.ts`'s `NullEventAggregator` stub already established
 * this "define the seam now, wire the real bus later" pattern.
 */
export abstract class ProviderStatusServiceBase<
  TModel extends ProviderStatusBase = ProviderStatusBase,
> implements IProviderStatusServiceBase<TModel> {
  protected maximumEscalationLevel = ESCALATION_BACKOFF_PERIODS_SECONDS.length - 1;
  protected minimumTimeSinceInitialFailureMs = 0;
  protected minimumTimeSinceStartupMs = 15 * 60 * 1000;

  constructor(
    protected readonly repository: IProviderStatusRepositoryLike<TModel>,
    protected readonly clock: ProviderStatusServiceClock = realClock
  ) {}

  getBlockedProviders(): TModel[] {
    return this.repository.all().filter(isProviderStatusDisabled);
  }

  protected getProviderStatus(providerId: number): TModel {
    return (
      this.repository.findByProviderId(providerId) ??
      (createProviderStatusBase({ providerId }) as TModel)
    );
  }

  protected calculateBackOffPeriodMs(status: TModel): number {
    const level = Math.min(this.maximumEscalationLevel, status.escalationLevel);
    return ESCALATION_BACKOFF_PERIODS_SECONDS[level]! * 1000;
  }

  recordSuccess(providerId: number): void {
    if (providerId <= 0) {
      return;
    }

    const status = this.getProviderStatus(providerId);

    if (status.escalationLevel === 0) {
      return;
    }

    status.escalationLevel--;
    status.disabledTill = null;

    this.repository.upsert(status);
  }

  protected recordFailureInternal(
    providerId: number,
    minimumBackOffMs: number,
    escalateInput: boolean
  ): void {
    if (providerId <= 0) {
      return;
    }

    let escalate = escalateInput;
    const status = this.getProviderStatus(providerId);

    const now = this.clock.now();
    status.mostRecentFailure = new Date(now).toISOString();

    if (status.escalationLevel === 0) {
      status.initialFailure = new Date(now).toISOString();
      status.escalationLevel = 1;
      escalate = false;
    }

    const inStartupGracePeriod = this.clock.startTimeMs + this.minimumTimeSinceStartupMs > now;
    const inGracePeriod =
      new Date(status.initialFailure!).getTime() + this.minimumTimeSinceInitialFailureMs > now;

    if (escalate && !inGracePeriod && !inStartupGracePeriod) {
      status.escalationLevel = Math.min(this.maximumEscalationLevel, status.escalationLevel + 1);
    }

    if (minimumBackOffMs !== 0) {
      while (
        status.escalationLevel < this.maximumEscalationLevel &&
        this.calculateBackOffPeriodMs(status) < minimumBackOffMs
      ) {
        status.escalationLevel++;
      }
    }

    if (!inGracePeriod || minimumBackOffMs !== 0) {
      status.disabledTill = new Date(now + this.calculateBackOffPeriodMs(status)).toISOString();
    }

    if (inStartupGracePeriod && minimumBackOffMs === 0 && status.disabledTill !== null) {
      const maximumDisabledTill = now + ESCALATION_BACKOFF_PERIODS_SECONDS[2]! * 1000;
      if (maximumDisabledTill < new Date(status.disabledTill).getTime()) {
        status.disabledTill = new Date(maximumDisabledTill).toISOString();
      }
    }

    this.repository.upsert(status);
  }

  recordFailure(providerId: number, minimumBackOffMs = 0): void {
    this.recordFailureInternal(providerId, minimumBackOffMs, true);
  }

  recordConnectionFailure(providerId: number): void {
    this.recordFailureInternal(providerId, 0, false);
  }

  /** Ported from ProviderStatusServiceBase.HandleAsync(ProviderDeletedEvent<TProvider>) -- see this class's doc comment re: no event bus yet. */
  handleProviderDeleted(providerId: number): void {
    this.repository.deleteByProviderId(providerId);
  }
}
