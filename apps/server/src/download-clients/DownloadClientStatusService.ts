import {
  createDownloadClientStatus,
  isDownloadClientStatusDisabled,
  type DownloadClientStatus,
} from "./DownloadClientStatus.js";
import type { IDownloadClientStatusRepository } from "./DownloadClientStatusRepository.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/EscalationBackOff.cs.
 * FORWARD-REFERENCE NARROWING: duplicated from `indexers/IndexerStatusService.ts`
 * rather than imported -- see DownloadClientStatus.ts's doc comment for why
 * a shared `ThingiProvider` extraction isn't done in this worktree. Values
 * are identical (this is a single shared C# static class, not
 * per-provider-kind data).
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

export interface IDownloadClientStatusService {
  getBlockedProviders(): DownloadClientStatus[];
  recordSuccess(providerId: number): void;
  /** `minimumBackOffMs` mirrors C#'s `TimeSpan minimumBackOff = default` (0 = TimeSpan.Zero). */
  recordFailure(providerId: number, minimumBackOffMs?: number): void;
  recordConnectionFailure(providerId: number): void;
}

/** Minimal clock/runtime-info seam so tests can control "now" and startup time, matching IRuntimeInfo.StartTime. */
export interface DownloadClientStatusServiceClock {
  now(): number;
  startTimeMs: number;
}

const realClock: DownloadClientStatusServiceClock = {
  now: () => Date.now(),
  startTimeMs: Date.now(),
};

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusServiceBase.cs
 * + NzbDrone.Core/Download/DownloadClientStatusService.cs. Same
 * inline-the-generic-base collapse as `indexers/IndexerStatusService.ts` --
 * see DownloadClientStatus.ts's doc comment.
 *
 * DownloadClientStatusService overrides two of the base's defaults (matching
 * the C# ctor body: `MinimumTimeSinceInitialFailure = TimeSpan.FromMinutes(5)`,
 * `MaximumEscalationLevel = 5` -- both different from IndexerStatusService,
 * which uses the base class's own defaults unchanged).
 */
export class DownloadClientStatusService implements IDownloadClientStatusService {
  protected maximumEscalationLevel = 5;
  protected minimumTimeSinceInitialFailureMs = 5 * 60 * 1000;
  protected minimumTimeSinceStartupMs = 15 * 60 * 1000;

  constructor(
    private readonly repository: IDownloadClientStatusRepository,
    private readonly clock: DownloadClientStatusServiceClock = realClock
  ) {}

  getBlockedProviders(): DownloadClientStatus[] {
    return this.repository.all().filter(isDownloadClientStatusDisabled);
  }

  private getProviderStatus(providerId: number): DownloadClientStatus {
    return (
      this.repository.findByProviderId(providerId) ?? createDownloadClientStatus({ providerId })
    );
  }

  private calculateBackOffPeriodMs(status: DownloadClientStatus): number {
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
}
