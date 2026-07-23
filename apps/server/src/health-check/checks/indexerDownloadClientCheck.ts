import type { IIndexerRepository } from "../../indexers/IndexerRepository.js";
import { isIndexerDefinitionEnabled } from "../../indexers/IndexerDefinition.js";
import type { DownloadClientDefinition } from "../../download-clients/DownloadClientDefinition.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/IndexerDownloadClientCheck.cs.
 *
 * `IIndexerFactory.All()`/`IDownloadClientFactory.All()` (base
 * `ProviderFactory<TProvider, TDefinition>.All()`: `providerRepository.All()`)
 * are narrowed to `IIndexerRepository.all()` (real,
 * `indexers/IndexerRepository.ts`) and a minimal `DownloadClientRepositoryLike`
 * -- both are exactly the repository-backed definition lists the real C#
 * base method reads from, just reached one layer down since neither ported
 * factory (`IndexerFactory`/`DownloadClientFactory`) exposes a raw `all()`
 * of definitions (both were narrowed to only the members their own
 * originating module needed -- see their doc comments).
 *
 * `[CheckOn(typeof(ProviderUpdatedEvent<IIndexer>))]`/`[CheckOn(typeof(
 * ProviderDeletedEvent<IIndexer>))]` collapse to the exact same
 * `ProviderUpdatedEvent`/`ProviderDeletedEvent` constructors as the
 * `IDownloadClient`-parameterized ones already registered below -- see
 * `downloadClientCheck.ts`'s doc comment for why that's a faithful
 * (if slightly over-triggering) port, not an omission. Each is only listed
 * once here since a `Map<EventCtor, ...>` key can't repeat.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
];

export interface DownloadClientRepositoryLike {
  all(): DownloadClientDefinition[];
}

export class IndexerDownloadClientCheck extends HealthCheckBase {
  constructor(
    private readonly indexerRepository: IIndexerRepository,
    private readonly downloadClientRepository: DownloadClientRepositoryLike,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const downloadClientIds = new Set(
      this.downloadClientRepository
        .all()
        .filter((v) => v.enable)
        .map((v) => v.id)
    );

    const invalidIndexers = this.indexerRepository
      .all()
      .filter(
        (v) =>
          isIndexerDefinitionEnabled(v) &&
          v.downloadClientId > 0 &&
          !downloadClientIds.has(v.downloadClientId)
      );

    if (invalidIndexers.length > 0) {
      return createHealthCheck(
        IndexerDownloadClientCheck,
        HealthCheckResult.Warning,
        formatMessage(
          this.localizationService.getLocalizedString("IndexerDownloadClientHealthCheckMessage"),
          invalidIndexers.map((v) => v.name).join(", ")
        ),
        "#invalid-indexer-download-client-setting"
      );
    }

    return createOkHealthCheck(IndexerDownloadClientCheck);
  }
}
