import type { IProvideDownloadClient } from "../../download-clients/DownloadClientProvider.js";
import type { IDownloadClientStatusService } from "../../download-clients/DownloadClientStatusService.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
import { ProviderStatusChangedEvent } from "../../thingi-provider/events/ProviderStatusChangedEvent.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/DownloadClientStatusCheck.cs.
 * See `downloadClientCheck.ts`'s doc comment re: why the `ProviderUpdatedEvent<
 * IDownloadClient>`/`ProviderDeletedEvent`/`ProviderStatusChangedEvent<
 * DownloadClientStatus>` `[CheckOn]` attributes DO subscribe faithfully here.
 *
 * `_providerFactory.GetAvailableProviders()` (`ProviderFactory<TProvider,
 * TDefinition>.GetAvailableProviders()`: `Active().Select(GetInstance)`,
 * i.e. every enabled+valid provider instance, unfiltered by blocked status)
 * has no equivalent method on this port's narrowed `IDownloadClientFactory`
 * (`download-clients/DownloadClientFactory.ts` -- see that file's own doc
 * comment on why it only ports the slice `DownloadClientFactory`/
 * `IDownloadClientFactory` add on top of the unported generic
 * `ProviderFactory` base). `IProvideDownloadClient.getDownloadClients(false)`
 * (`download-clients/DownloadClientProvider.ts`) is the faithful substitute:
 * it resolves to the exact same underlying call
 * (`downloadClientFactory.downloadHandlingEnabled(false)`, i.e. active
 * providers, unfiltered by blocked status -- see that file's
 * `getDownloadClients` implementation), just reached through the already-
 * ported provider (constructed once per app, matching how `DownloadClientCheck`
 * itself already depends on `IProvideDownloadClient` rather than the raw
 * factory) instead of the factory directly.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

export class DownloadClientStatusCheck extends HealthCheckBase {
  constructor(
    private readonly downloadClientProvider: IProvideDownloadClient,
    private readonly providerStatusService: IDownloadClientStatusService,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const enabledProviders = this.downloadClientProvider.getDownloadClients(false);
    const blockedById = new Map(
      this.providerStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );
    const backOffProviders = enabledProviders.filter((p) => blockedById.has(p.definition.id));

    if (backOffProviders.length === 0) {
      return createOkHealthCheck(DownloadClientStatusCheck);
    }

    if (backOffProviders.length === enabledProviders.length) {
      return createHealthCheck(
        DownloadClientStatusCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("DownloadClientStatusCheckAllClientMessage"),
        "#download-clients-are-unavailable-due-to-failures"
      );
    }

    return createHealthCheck(
      DownloadClientStatusCheck,
      HealthCheckResult.Warning,
      formatMessage(
        this.localizationService.getLocalizedString("DownloadClientStatusCheckSingleClientMessage"),
        backOffProviders.map((v) => v.definition.name).join(", ")
      ),
      "#download-clients-are-unavailable-due-to-failures"
    );
  }
}
