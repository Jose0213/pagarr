import type { IIndexerFactory } from "../../indexers/IndexerFactory.js";
import type { IIndexerStatusService } from "../../indexers/IndexerStatusService.js";
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
import { availableProviders } from "./indexerStatusCheck.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/IndexerLongTermStatusCheck.cs.
 * The complement of `IndexerStatusCheck` -- same `[CheckOn]` set, same
 * `GetAvailableProviders()` substitute (see `indexerStatusCheck.ts`'s doc
 * comment and its shared `availableProviders()` helper, reused here), but
 * filters `initialFailure BEFORE (now - 6h)` instead of `AFTER`.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export class IndexerLongTermStatusCheck extends HealthCheckBase {
  constructor(
    private readonly indexerFactory: IIndexerFactory,
    private readonly indexerStatusService: IIndexerStatusService,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const enabledProviders = availableProviders(this.indexerFactory);
    const enabledIds = new Set(enabledProviders.map((p) => p.definition.id));

    const sixHoursAgo = Date.now() - SIX_HOURS_MS;

    const backOffProviders = this.indexerStatusService
      .getBlockedProviders()
      .filter(
        (s) =>
          enabledIds.has(s.providerId) &&
          s.initialFailure !== null &&
          new Date(s.initialFailure).getTime() < sixHoursAgo
      );

    if (backOffProviders.length === 0) {
      return createOkHealthCheck(IndexerLongTermStatusCheck);
    }

    if (backOffProviders.length === enabledProviders.length) {
      return createHealthCheck(
        IndexerLongTermStatusCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("IndexerLongTermStatusCheckAllClientMessage"),
        "#indexers-are-unavailable-due-to-failures"
      );
    }

    const blockedIds = new Set(backOffProviders.map((s) => s.providerId));
    const names = enabledProviders
      .filter((p) => blockedIds.has(p.definition.id))
      .map((p) => p.definition.name);

    return createHealthCheck(
      IndexerLongTermStatusCheck,
      HealthCheckResult.Warning,
      formatMessage(
        this.localizationService.getLocalizedString(
          "IndexerLongTermStatusCheckSingleClientMessage"
        ),
        names.join(", ")
      ),
      "#indexers-are-unavailable-due-to-failures"
    );
  }
}
