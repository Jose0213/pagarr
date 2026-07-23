import {
  ProviderStatusServiceBase,
  type ProviderStatusServiceClock,
} from "../thingi-provider/status/ProviderStatusServiceBase.js";
import type { INotificationStatusRepository } from "./NotificationStatusRepository.js";
import type { NotificationStatus } from "./NotificationStatus.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationStatusService.cs +
 * NzbDrone.Core/ThingiProvider/Status/ProviderStatusServiceBase.cs.
 *
 * `NotificationStatusService : ProviderStatusServiceBase<INotification,
 * NotificationStatus>` in C#, whose constructor overrides two of the base's
 * defaults: `MinimumTimeSinceInitialFailure = TimeSpan.FromMinutes(5)`,
 * `MaximumEscalationLevel = 5` (`MinimumTimeSinceStartup` is left at the
 * base's own default). `DownloadClientStatusService`'s C# analog overrides
 * the exact same two fields with the exact same values -- both provider
 * kinds happen to use identical backoff tuning. Built on the REAL
 * `thingi-provider/status/ProviderStatusServiceBase.ts` generic base (per
 * this module's task brief), rather than re-duplicating it inline the way
 * `download-clients/DownloadClientStatusService.ts` had to (see that file's
 * doc comment -- ThingiProvider didn't exist yet at that point).
 */
export interface INotificationStatusService {
  getBlockedProviders(): NotificationStatus[];
  recordSuccess(providerId: number): void;
  recordFailure(providerId: number, minimumBackOffMs?: number): void;
  recordConnectionFailure(providerId: number): void;
}

export class NotificationStatusService
  extends ProviderStatusServiceBase<NotificationStatus>
  implements INotificationStatusService
{
  constructor(repository: INotificationStatusRepository, clock?: ProviderStatusServiceClock) {
    super(repository, clock);

    // Ported from the NotificationStatusService ctor body: MinimumTimeSinceInitialFailure = 5min, MaximumEscalationLevel = 5.
    this.minimumTimeSinceInitialFailureMs = 5 * 60 * 1000;
    this.maximumEscalationLevel = 5;
  }
}
