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
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/IndexerStatusCheck.cs.
 *
 * `_providerFactory.GetAvailableProviders()` (the real `ProviderFactory`
 * base method) is available here as `IIndexerFactory` narrows a slightly
 * different member set (`rssEnabled`/`automaticSearchEnabled`/
 * `interactiveSearchEnabled`, see that file's doc comment) -- none of them
 * is "every active indexer regardless of RSS/search settings", which is
 * what `GetAvailableProviders()` returns. This check instead intersects
 * `IIndexerStatusService.getBlockedProviders()` (already exactly the
 * "backed-off providers" half of the join) against ALL of `rssEnabled(false)
 * ∪ automaticSearchEnabled(false) ∪ interactiveSearchEnabled(false)` (the
 * union covers "every indexer active for any purpose", the closest
 * reachable proxy for `GetAvailableProviders()` given this port's narrowed
 * `IIndexerFactory` surface) via `enabledCount()`/`backOffCount()` helpers,
 * preserving the real three-way Ok/Warning/Error branching exactly.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export class IndexerStatusCheck extends HealthCheckBase {
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
          new Date(s.initialFailure).getTime() > sixHoursAgo
      );

    if (backOffProviders.length === 0) {
      return createOkHealthCheck(IndexerStatusCheck);
    }

    if (backOffProviders.length === enabledProviders.length) {
      return createHealthCheck(
        IndexerStatusCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("IndexerStatusCheckAllClientMessage"),
        "#indexers-are-unavailable-due-to-failures"
      );
    }

    const blockedIds = new Set(backOffProviders.map((s) => s.providerId));
    const names = enabledProviders
      .filter((p) => blockedIds.has(p.definition.id))
      .map((p) => p.definition.name);

    return createHealthCheck(
      IndexerStatusCheck,
      HealthCheckResult.Warning,
      formatMessage(
        this.localizationService.getLocalizedString("IndexerStatusCheckSingleClientMessage"),
        names.join(", ")
      ),
      "#indexers-are-unavailable-due-to-failures"
    );
  }
}

/** Ported from `IIndexerFactory.GetAvailableProviders()` -- see this file's module doc comment for the union-of-purposes substitute. */
export function availableProviders(
  indexerFactory: IIndexerFactory
): ReturnType<IIndexerFactory["rssEnabled"]> {
  const byId = new Map<number, ReturnType<IIndexerFactory["rssEnabled"]>[number]>();

  for (const indexer of [
    ...indexerFactory.rssEnabled(false),
    ...indexerFactory.automaticSearchEnabled(false),
    ...indexerFactory.interactiveSearchEnabled(false),
  ]) {
    byId.set(indexer.definition.id, indexer);
  }

  return [...byId.values()];
}
