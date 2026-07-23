import type { IProviderStatusRepositoryLike } from "../../thingi-provider/status/ProviderStatusServiceBase.js";
import type { ProviderStatusBase } from "../../thingi-provider/status/ProviderStatusBase.js";
import { FixFutureProviderStatusTimes } from "./fixFutureProviderStatusTimes.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureNotificationStatusTimes.cs.
 *
 * `INotificationStatusRepository` doesn't exist yet (Notifications module
 * not ported -- see ../providerStatusRepositories.ts's doc comment); the
 * constructor takes the real `IProviderStatusRepositoryLike<ProviderStatusBase>`
 * shape instead, satisfied today by `NotificationStatusRepositoryForCleanup`.
 */
export class FixFutureNotificationStatusTimes extends FixFutureProviderStatusTimes<ProviderStatusBase> {
  constructor(notificationStatusRepository: IProviderStatusRepositoryLike<ProviderStatusBase>) {
    super(notificationStatusRepository);
  }
}
