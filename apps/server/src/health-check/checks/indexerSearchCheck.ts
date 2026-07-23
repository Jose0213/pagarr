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

/** Ported from NzbDrone.Core/HealthCheck/Checks/IndexerSearchCheck.cs. */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderAddedEvent, CheckOnCondition.Always),
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

export class IndexerSearchCheck extends HealthCheckBase {
  constructor(
    private readonly indexerFactory: IIndexerFactory,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const automaticSearchEnabled = this.indexerFactory.automaticSearchEnabled(false);

    if (automaticSearchEnabled.length === 0) {
      return createHealthCheck(
        IndexerSearchCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("IndexerSearchCheckNoAutomaticMessage"),
        "#no-indexers-available-with-automatic-search-enabled-readarr-will-not-provide-any-automatic-search-results"
      );
    }

    const interactiveSearchEnabled = this.indexerFactory.interactiveSearchEnabled(false);

    if (interactiveSearchEnabled.length === 0) {
      return createHealthCheck(
        IndexerSearchCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("IndexerSearchCheckNoInteractiveMessage"),
        "#no-indexers-available-with-interactive-search-enabled"
      );
    }

    const active = this.indexerFactory.automaticSearchEnabled(true);

    if (active.length === 0) {
      return createHealthCheck(
        IndexerSearchCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("IndexerSearchCheckNoAvailableIndexersMessage"),
        "#indexers-are-unavailable-due-to-failures"
      );
    }

    return createOkHealthCheck(IndexerSearchCheck);
  }
}
