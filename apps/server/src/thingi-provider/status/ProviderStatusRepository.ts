import { BasicRepository, type BasicRepositoryOptions } from "../../db/basic-repository.js";
import type { IDatabase } from "../../db/database.js";
import type { ProviderStatusBase } from "./ProviderStatusBase.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusRepository.cs.
 *
 * The real generic base `IndexerStatusRepository`/`DownloadClientStatusRepository`
 * were each independently modeled after -- both siblings explicitly opted
 * OUT of `BasicRepository<TModel>` because their status row has a
 * JSON-embedded extra column requiring custom row mapping (Indexers'
 * `LastRssSyncReleaseInfo` -- see `indexers/IndexerStatusRepository.ts`'s
 * "DEVIATION" doc comment; DownloadClients has no such column and *could*
 * have used BasicRepository, but was ported before this class existed).
 * This generic base itself has no such extra-column problem (see
 * ProviderStatusBase.ts's doc comment -- provider-kind-specific extra
 * columns are added by the concrete extending interface, not this base),
 * so unlike its two narrow derivations, this port builds directly on
 * `BasicRepository<TModel>` -- matching the C# original, which itself
 * extends `BasicRepository<TModel>` with no query override.
 *
 * `findByProviderId`/`deleteByProviderId` are ported from the C# subclass's
 * two added members (`Query(c => c.ProviderId == providerId)
 * .SingleOrDefault()` / `Delete(c => c.ProviderId == providerId)`) as thin
 * wrappers using `BasicRepository`'s own filter-expression support rather
 * than hand-rolled SQL, since -- unlike the two siblings' JSON-embedded-
 * column repositories -- this base has no reason to bypass it.
 */
export class ProviderStatusRepository<
  TModel extends ProviderStatusBase = ProviderStatusBase,
> extends BasicRepository<TModel> {
  constructor(database: IDatabase, options: BasicRepositoryOptions<TModel>) {
    super(database, options);
  }

  /** Ported from ProviderStatusRepository.FindByProviderId(): Query(c => c.ProviderId == providerId).SingleOrDefault(). */
  findByProviderId(providerId: number): TModel | undefined {
    return this.all().find((s) => s.providerId === providerId);
  }

  /** Ported from ProviderStatusRepository.DeleteByProviderId(): Delete(c => c.ProviderId == providerId). */
  deleteByProviderId(providerId: number): void {
    const existing = this.findByProviderId(providerId);
    if (existing) {
      this.delete(existing.id);
    }
  }
}
