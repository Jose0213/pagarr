import type { IIndexerRepository } from "../../indexers/IndexerRepository.js";
import { isIndexerDefinitionEnabled } from "../../indexers/IndexerDefinition.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/IndexerJackettAllCheck.cs.
 *
 * FORWARD-REFERENCE: `NzbDrone.Core.Indexers.Torznab.TorznabSettings` (the
 * `BaseUrl`/`ApiPath` fields this check reads) is not ported -- this repo's
 * `indexers/` module only carries the generic `IIndexerSettings`/
 * `IProviderConfig` base shape (`baseUrl`/`earlyReleaseLimit`), with no
 * concrete Torznab settings class (see `indexers/IIndexerSettings.ts`'s doc
 * comment and the empty grep for "TorznabSettings" across the whole port).
 * Narrowed to the two string fields this check actually reads
 * (`baseUrl`/`apiPath`), matched against `definition.configContract ===
 * "TorznabSettings"` exactly as the real C# does (a string comparison, not
 * a type check either way).
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderAddedEvent, CheckOnCondition.Always),
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

/** FORWARD-REFERENCE narrowing of `TorznabSettings` -- see module doc comment. */
export interface TorznabSettingsLike {
  baseUrl: string;
  apiPath: string;
}

const JACKETT_ALL_PATTERNS = [
  "/torznab/all/api",
  "/api/v2.0/indexers/all/results/torznab",
] as const;

function containsAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

export class IndexerJackettAllCheck extends HealthCheckBase {
  constructor(
    private readonly indexerRepository: IIndexerRepository,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const jackettAllProviders = this.indexerRepository.all().filter((i) => {
      if (!isIndexerDefinitionEnabled(i) || i.configContract !== "TorznabSettings") {
        return false;
      }

      const settings = i.settings as TorznabSettingsLike | null;
      if (!settings) {
        return false;
      }

      return (
        containsAny(settings.baseUrl, JACKETT_ALL_PATTERNS) ||
        containsAny(settings.apiPath, JACKETT_ALL_PATTERNS)
      );
    });

    if (jackettAllProviders.length === 0) {
      return createOkHealthCheck(IndexerJackettAllCheck);
    }

    return createHealthCheck(
      IndexerJackettAllCheck,
      HealthCheckResult.Warning,
      formatMessage(
        this.localizationService.getLocalizedString("IndexerJackettAll"),
        jackettAllProviders.map((i) => i.name).join(", ")
      ),
      "#jackett-all-endpoint-used"
    );
  }
}
