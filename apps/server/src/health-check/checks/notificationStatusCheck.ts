import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
import { ProviderStatusChangedEvent } from "../../thingi-provider/events/ProviderStatusChangedEvent.js";
import type { ProviderStatusBase } from "../../thingi-provider/status/ProviderStatusBase.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/NotificationStatusCheck.cs.
 *
 * FORWARD-REFERENCE: `NzbDrone.Core.Notifications` (`INotificationFactory`,
 * `INotificationStatusService`) is Phase 4 Wave 2 per PORT_PLAN.md, not
 * ported yet ("Notifications (176 files, second-largest)... staged once
 * Wave 1 lands"). Same narrowing shape as `importListStatusCheck.ts`:
 * `getAvailableProviders(): { definition: { id, name } }[]` for the
 * factory, and the real `ProviderStatusBase` shape
 * (`thingi-provider/status/ProviderStatusBase.ts`) for the status service,
 * since Notifications' `NotificationStatus` is documented (in that file's
 * own doc comment) as conceptually extending the same base IndexerStatus/
 * DownloadClientStatus do.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

export interface NotificationProviderLike {
  definition: { id: number; name: string };
}

export interface NotificationFactoryLike {
  getAvailableProviders(): NotificationProviderLike[];
}

export interface NotificationStatusServiceLike {
  getBlockedProviders(): ProviderStatusBase[];
}

export class NotificationStatusCheck extends HealthCheckBase {
  constructor(
    private readonly providerFactory: NotificationFactoryLike,
    private readonly providerStatusService: NotificationStatusServiceLike,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const enabledProviders = this.providerFactory.getAvailableProviders();
    const blockedById = new Map(
      this.providerStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );
    const backOffProviders = enabledProviders.filter((p) => blockedById.has(p.definition.id));

    if (backOffProviders.length === 0) {
      return createOkHealthCheck(NotificationStatusCheck);
    }

    if (backOffProviders.length === enabledProviders.length) {
      return createHealthCheck(
        NotificationStatusCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString(
          "NotificationStatusAllClientHealthCheckMessage"
        ),
        "#notifications-are-unavailable-due-to-failures"
      );
    }

    return createHealthCheck(
      NotificationStatusCheck,
      HealthCheckResult.Warning,
      formatMessage(
        this.localizationService.getLocalizedString(
          "NotificationStatusSingleClientHealthCheckMessage"
        ),
        backOffProviders.map((v) => v.definition.name).join(", ")
      ),
      "#notifications-are-unavailable-due-to-failures"
    );
  }
}
