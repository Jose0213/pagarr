import type { IIndexerFactory } from "../../indexers/IndexerFactory.js";
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

/** Ported from NzbDrone.Core/HealthCheck/Checks/IndexerRssCheck.cs. `IIndexerFactory.RssEnabled` is real (`indexers/IndexerFactory.ts`). */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderAddedEvent, CheckOnCondition.Always),
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

export class IndexerRssCheck extends HealthCheckBase {
  constructor(
    private readonly indexerFactory: IIndexerFactory,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const enabled = this.indexerFactory.rssEnabled(false);

    if (enabled.length === 0) {
      return createHealthCheck(
        IndexerRssCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("IndexerRssHealthCheckNoIndexers"),
        "#no-indexers-available-with-rss-sync-enabled-readarr-will-not-grab-new-releases-automatically"
      );
    }

    const active = this.indexerFactory.rssEnabled(true);

    if (active.length === 0) {
      return createHealthCheck(
        IndexerRssCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("IndexerRssHealthCheckNoAvailableIndexers"),
        "#indexers-are-unavailable-due-to-failures"
      );
    }

    return createOkHealthCheck(IndexerRssCheck);
  }
}
