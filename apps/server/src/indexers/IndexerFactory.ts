import type { IIndexer } from "./IIndexer.js";
import type { IndexerDefinition } from "./IndexerDefinition.js";
import type { IIndexerStatusService } from "./IndexerStatusService.js";
import type { ValidationResult } from "./IIndexerSettings.js";

/** Minimal logger surface IndexerFactory needs. */
export interface IndexerFactoryLogger {
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: IndexerFactoryLogger = { debug: () => {} };

/**
 * Ported from NzbDrone.Core/Indexers/IndexerFactory.cs +
 * NzbDrone.Core/ThingiProvider/ProviderFactory.cs.
 *
 * FORWARD-REFERENCE NARROWING: `ProviderFactory<TProvider, TProviderDefinition>`
 * (the not-yet-ported `ThingiProvider` module's generic instantiate-and-
 * cache-providers-from-their-definitions machinery: reflection-based
 * provider construction via DI container, `SetProviderCharacteristics`,
 * `GetAvailableProviders`/`Active`/`Enabled` filtering, provider CRUD with
 * `ProviderAddedEvent`/`ProviderUpdatedEvent`/`ProviderDeletedEvent`
 * publication) is the base `IndexerFactory` extends in C#. Rather than port
 * that whole generic base for a single concrete subclass, this port takes
 * an already-instantiated `IIndexer[]` (the equivalent of C#'s
 * `IEnumerable<IIndexer> providers` ctor param, minus the DI-container
 * reflection step `ProviderFactory.GetAvailableProviders()` uses to build
 * it) and implements exactly the members `IndexerFactory`/`IIndexerFactory`
 * add on top: `RssEnabled`/`AutomaticSearchEnabled`/`InteractiveSearchEnabled`
 * (each filtering by its definition flag + blocked-status) and `Test()`
 * (recording success/failure via `IIndexerStatusService`). A later phase
 * porting `ThingiProvider` in full can re-home a generic
 * `ProviderFactory<TProvider, TDefinition>` and have this class extend it
 * without changing these method signatures.
 */
export interface IIndexerFactory {
  rssEnabled(filterBlockedIndexers?: boolean): IIndexer[];
  automaticSearchEnabled(filterBlockedIndexers?: boolean): IIndexer[];
  interactiveSearchEnabled(filterBlockedIndexers?: boolean): IIndexer[];
  test(definition: IndexerDefinition): Promise<ValidationResult>;
}

export class IndexerFactory implements IIndexerFactory {
  constructor(
    private readonly indexerStatusService: IIndexerStatusService,
    private readonly providers: IIndexer[],
    private readonly logger: IndexerFactoryLogger = noopLogger
  ) {}

  /** Ported from ProviderFactory.Active(): base filters definitions where `.Enable`. */
  private activeProviders(): IIndexer[] {
    return this.providers.filter((p) => isDefinitionEnabled(p.definition));
  }

  private filterBlockedIndexers(indexers: IIndexer[]): IIndexer[] {
    const blocked = new Map(
      this.indexerStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );

    const result: IIndexer[] = [];
    for (const indexer of indexers) {
      const blockedStatus = blocked.get(indexer.definition.id);
      if (blockedStatus) {
        this.logger.debug(
          "Temporarily ignoring indexer %s till %s due to recent failures.",
          indexer.definition.name,
          blockedStatus.disabledTill
        );
        continue;
      }
      result.push(indexer);
    }
    return result;
  }

  rssEnabled(filterBlockedIndexers = true): IIndexer[] {
    const enabled = this.activeProviders().filter((p) => p.definition.enableRss);
    return filterBlockedIndexers ? this.filterBlockedIndexers(enabled) : enabled;
  }

  automaticSearchEnabled(filterBlockedIndexers = true): IIndexer[] {
    const enabled = this.activeProviders().filter((p) => p.definition.enableAutomaticSearch);
    return filterBlockedIndexers ? this.filterBlockedIndexers(enabled) : enabled;
  }

  interactiveSearchEnabled(filterBlockedIndexers = true): IIndexer[] {
    const enabled = this.activeProviders().filter((p) => p.definition.enableInteractiveSearch);
    return filterBlockedIndexers ? this.filterBlockedIndexers(enabled) : enabled;
  }

  /**
   * Ported from IndexerFactory.Test(IndexerDefinition definition): records
   * success/failure on the indexer status service after running the base
   * `ProviderFactory.Test()` (narrowed here to "find the matching live
   * `IIndexer` instance and call its own `.test()`" -- ProviderFactory's
   * actual base `Test()` does DI-container instantiation of a throwaway
   * provider instance from the definition, which is out of scope per the
   * doc comment above).
   */
  async test(definition: IndexerDefinition): Promise<ValidationResult> {
    const indexer = this.providers.find((p) => p.definition.id === definition.id);
    const result = indexer
      ? await indexer.test()
      : { isValid: true, hasWarnings: false, errors: [] };

    if (definition.id === 0) {
      return result;
    }

    if (result.isValid) {
      this.indexerStatusService.recordSuccess(definition.id);
    } else {
      this.indexerStatusService.recordFailure(definition.id);
    }

    return result;
  }
}

function isDefinitionEnabled(definition: IndexerDefinition): boolean {
  return (
    definition.enableRss || definition.enableAutomaticSearch || definition.enableInteractiveSearch
  );
}
