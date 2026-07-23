import {
  createIndexerStatus,
  isIndexerStatusDisabled,
  type IndexerStatus,
} from "./IndexerStatus.js";
import type { IIndexerStatusRepository } from "./IndexerStatusRepository.js";
import type { ReleaseInfo } from "./releaseInfo.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/EscalationBackOff.cs.
 * FORWARD-REFERENCE NARROWING: kept here rather than under a
 * `thingiProvider/` dir since Indexers is the only provider-kind module
 * ported so far (same rationale as IndexerStatus.ts/IndexerDefinition.ts).
 */
export const ESCALATION_BACKOFF_PERIODS_SECONDS: readonly number[] = [
  0,
  60,
  5 * 60,
  15 * 60,
  30 * 60,
  60 * 60,
  3 * 60 * 60,
  6 * 60 * 60,
  12 * 60 * 60,
  24 * 60 * 60,
];

export interface IIndexerStatusService {
  getBlockedProviders(): IndexerStatus[];
  recordSuccess(providerId: number): void;
  /** `minimumBackOffMs` mirrors C#'s `TimeSpan minimumBackOff = default` (0 = TimeSpan.Zero). */
  recordFailure(providerId: number, minimumBackOffMs?: number): void;
  recordConnectionFailure(providerId: number): void;
  getLastRssSyncReleaseInfo(indexerId: number): ReleaseInfo | null;
  updateRssSyncStatus(indexerId: number, releaseInfo: ReleaseInfo): void;
}

/** Minimal clock/runtime-info seam so tests can control "now" and startup time, matching IRuntimeInfo.StartTime. */
export interface IndexerStatusServiceClock {
  now(): number;
  startTimeMs: number;
}

const realClock: IndexerStatusServiceClock = {
  now: () => Date.now(),
  startTimeMs: Date.now(),
};

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusServiceBase.cs
 * + NzbDrone.Core/Indexers/IndexerStatusService.cs. C#'s
 * `ProviderStatusServiceBase<TProvider, TModel>` generic base (shared across
 * every provider kind) is collapsed directly into this Indexers-specific
 * class -- same "first provider-kind module ported" rationale as
 * IndexerStatus.ts/IndexerDefinition.ts. The `lock (_syncRoot)` C# uses for
 * thread-safety has no Node equivalent/need (single-threaded event loop).
 */
export class IndexerStatusService implements IIndexerStatusService {
  protected maximumEscalationLevel = ESCALATION_BACKOFF_PERIODS_SECONDS.length - 1;
  protected minimumTimeSinceInitialFailureMs = 0;
  protected minimumTimeSinceStartupMs = 15 * 60 * 1000;

  constructor(
    private readonly repository: IIndexerStatusRepository,
    private readonly clock: IndexerStatusServiceClock = realClock
  ) {}

  getBlockedProviders(): IndexerStatus[] {
    return this.repository.all().filter(isIndexerStatusDisabled);
  }

  private getProviderStatus(providerId: number): IndexerStatus {
    return this.repository.findByProviderId(providerId) ?? createIndexerStatus({ providerId });
  }

  private calculateBackOffPeriodMs(status: IndexerStatus): number {
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

  private recordFailureInternal(
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

  getLastRssSyncReleaseInfo(indexerId: number): ReleaseInfo | null {
    return this.getProviderStatus(indexerId).lastRssSyncReleaseInfo;
  }

  updateRssSyncStatus(indexerId: number, releaseInfo: ReleaseInfo): void {
    const status = this.getProviderStatus(indexerId);
    status.lastRssSyncReleaseInfo = releaseInfo;
    this.repository.upsert(status);
  }
}
