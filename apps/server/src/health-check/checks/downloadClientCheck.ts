import type { IProvideDownloadClient } from "../../download-clients/DownloadClientProvider.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderAddedEvent } from "../../thingi-provider/events/ProviderAddedEvent.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/DownloadClientCheck.cs.
 *
 * `ProviderAddedEvent<IDownloadClient>`/etc. are C# reified generics over
 * `IDownloadClient` specifically -- unlike `ModelEvent<T>` (see
 * `calibreRootFolderCheck.ts`'s doc comment for why that one CAN'T be
 * reproduced), `thingi-provider/events/*.ts`'s `ProviderAddedEvent<
 * TProviderConfig>`/`ProviderUpdatedEvent<TProviderConfig>` are generic over
 * *settings config type*, not provider kind, and there is genuinely only one
 * concrete class per event kind regardless of type parameter (same
 * situation `messaging/events/eventAggregator.ts`'s "Event identity" doc
 * comment describes: the constructor itself is the subscription key). So
 * these DO subscribe faithfully here -- the class identity
 * (`ProviderAddedEvent`) is what's checked on, not which `TProviderConfig`
 * it's parameterized with; this matches the real C# behavior too, since
 * .NET's `EventAggregator` dispatches on `message.GetType()` which for a
 * closed generic IS the fully-specified type (`ProviderAddedEvent<
 * DownloadClientDefinition-config>` vs `ProviderAddedEvent<IndexerDefinition-config>`
 * are different .NET Types) -- a nuance this port's `EventCtor`-keyed
 * dispatch cannot reproduce (both event kinds, regardless of provider kind,
 * collapse to the same `ProviderAddedEvent` constructor at the TS runtime
 * level), so in practice this check will also re-run on an *Indexer*
 * provider-added/updated/deleted/status-changed event, not just a
 * DownloadClient one -- a strictly harmless over-triggering (an extra,
 * no-op-ish re-check), not a missed one, and worth flagging for the human
 * merge review rather than silently accepting.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderAddedEvent, CheckOnCondition.Always),
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

/** Minimal logger surface this check needs. */
export interface DownloadClientCheckLogger {
  debug(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
}

const noopLogger: DownloadClientCheckLogger = { debug: () => {} };

export class DownloadClientCheck extends HealthCheckBase {
  constructor(
    private readonly downloadClientProvider: IProvideDownloadClient,
    localizationService: ILocalizationService,
    private readonly logger: DownloadClientCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    const downloadClients = this.downloadClientProvider.getDownloadClients();

    if (downloadClients.length === 0) {
      return createHealthCheck(
        DownloadClientCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("DownloadClientCheckNoneAvailableMessage"),
        "#no-download-client-is-available"
      );
    }

    for (const downloadClient of downloadClients) {
      try {
        await downloadClient.getItems();
      } catch (ex) {
        this.logger.debug(ex, "Unable to communicate with {0}", downloadClient.definition.name);

        const message = formatMessage(
          this.localizationService.getLocalizedString(
            "DownloadClientCheckUnableToCommunicateMessage"
          ),
          downloadClient.definition.name
        );
        const exMessage = ex instanceof Error ? ex.message : String(ex);
        return createHealthCheck(
          DownloadClientCheck,
          HealthCheckResult.Error,
          `${message} ${exMessage}`,
          "#unable-to-communicate-with-download-client"
        );
      }
    }

    return createOkHealthCheck(DownloadClientCheck);
  }
}
