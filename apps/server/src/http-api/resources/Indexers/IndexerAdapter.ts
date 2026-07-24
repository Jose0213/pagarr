import type {
  IIndexer,
  IIndexerFactory,
  IndexerDefinition,
  IIndexerRepository,
} from "../../../indexers/index.js";
import { createIndexerDefinition } from "../../../indexers/index.js";
import type {
  IProvider,
  IProviderConfig,
  IProviderFactory,
  IProviderRepository,
  ProviderDefinition,
  ValidationResult,
} from "../../../thingi-provider/index.js";
import { createProviderDefinition } from "../../../thingi-provider/index.js";

/**
 * Bridges `apps/server/src/indexers/*` (IIndexer/IndexerDefinition/
 * IndexerFactory/IndexerRepository) onto `thingi-provider`'s generic
 * `IProvider`/`ProviderDefinition`/`IProviderFactory`/`IProviderRepository`
 * shapes so `rest/ProviderControllerBase.ts`'s `providerControllerBase()`
 * factory -- built against the real, general ThingiProvider base -- can be
 * used for `IndexerController` exactly as the real C# `IndexerController :
 * ProviderControllerBase<IndexerResource, IndexerBulkResource, IIndexer,
 * IndexerDefinition>` does.
 *
 * ## Why this adapter exists at all
 *
 * `indexers/IndexerDefinition.ts`/`IndexerFactory.ts`/`IIndexer.ts`/
 * `IndexerRepository.ts` were each ported and merged to `main` BEFORE
 * `thingi-provider/` existed (an earlier Phase 4 module) -- their own doc
 * comments say so explicitly ("FORWARD-REFERENCE NARROWING... a later phase
 * porting `ThingiProvider` in full can re-home a generic `ProviderFactory
 * <TProvider, TDefinition>` and have this class extend it without changing
 * these method signatures") and `thingi-provider/ProviderFactory.ts`'s own
 * doc comment confirms the other side of the same fact ("the four
 * already-merged sibling modules... are NOT retrofitted to use it -- out of
 * scope"). So today, on `main`, `IndexerDefinition` does NOT structurally
 * satisfy `ProviderDefinition` (it's missing `implementationName`/`enable`
 * as real fields -- `enable` is a *computed* function,
 * `isIndexerDefinitionEnabled()`, not a stored property) and `IndexerFactory`
 * does NOT implement `IProviderFactory` (no `create`/`update`/`delete`/
 * `getInstance`/etc. -- it only has the narrow `rssEnabled`/
 * `automaticSearchEnabled`/`interactiveSearchEnabled`/`test` slice
 * `indexer-search` needed).
 *
 * Retrofitting `indexers/*` itself is out of this task's scope (a different
 * module, already merged, not part of this worktree's file set per the
 * task's "9 sibling agents... zero file overlap expected" contract). This
 * adapter is the narrow, local translation layer instead -- it owns NO
 * business logic of its own, just shape conversion, so `providerControllerBase`
 * (real, general, already-merged Phase 5 code) can drive the real
 * `IndexerRepository`/`IndexerFactory` underneath unmodified.
 *
 * ## `IndexerProviderDefinition`: carrying Indexer-only fields through the
 * generic pipeline
 *
 * `IndexerDefinition` has five fields with no home on the generic
 * `ProviderDefinition` shape (`enableRss`/`enableAutomaticSearch`/
 * `enableInteractiveSearch`/`priority`/`downloadClientId` -- the real C#
 * `IndexerResource`/`IndexerBulkResource` subclasses add exactly these same
 * fields on top of their own generic `ProviderResource<T>`/
 * `ProviderBulkResource<T>` bases). Rather than a side-channel keyed lookup
 * (fragile -- object identity isn't guaranteed to survive every hop through
 * `providerControllerBase`'s internals), this adapter defines
 * `IndexerProviderDefinition` as `ProviderDefinition<IProviderConfig>` PLUS
 * those five fields as real, typed, always-present properties. Every
 * function in this file that produces a `ProviderDefinition` for the
 * Indexers pipeline actually produces (and expects) this wider shape --
 * `providerControllerBase` itself only ever reads/writes the generic
 * `ProviderDefinition` members it knows about (structural typing: reading a
 * narrower view of a wider object is always safe), while `IndexerResource.ts`
 * /`IndexerBulkResource.ts`/`IndexerController.ts` read/write the extra five
 * fields directly off the same object, in the exact same request, with no
 * lookup required. This is the direct TS analog of the real C# situation,
 * where `IndexerDefinition : ProviderDefinition` genuinely HAS these fields
 * as real inherited-plus-own properties on one object -- this port can't
 * make `ProviderDefinition` an actual base interface `IndexerProviderDefinition`
 * extends without editing `thingi-provider/ProviderDefinition.ts` (out of
 * scope), so extension is expressed via intersection instead of inheritance,
 * with identical runtime behavior.
 */
export interface IndexerProviderDefinition extends ProviderDefinition<IProviderConfig> {
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  priority: number;
  downloadClientId: number;
}

const DEFAULT_INDEXER_FIELDS: Pick<
  IndexerProviderDefinition,
  | "enableRss"
  | "enableAutomaticSearch"
  | "enableInteractiveSearch"
  | "priority"
  | "downloadClientId"
> = {
  enableRss: false,
  enableAutomaticSearch: false,
  enableInteractiveSearch: false,
  priority: 25,
  downloadClientId: 0,
};

// ---- Definition <-> ProviderDefinition ------------------------------------

/** `IndexerDefinition -> IndexerProviderDefinition`. `enable` is computed from the three EnableRss/EnableAutomaticSearch/EnableInteractiveSearch flags, matching `IndexerDefinition.Enable`'s real C# override (get-only, not a stored column) -- see IndexerDefinition.ts's `isIndexerDefinitionEnabled()`. */
export function toProviderDefinition(definition: IndexerDefinition): IndexerProviderDefinition {
  return {
    id: definition.id,
    name: definition.name,
    implementationName: definition.implementation,
    implementation: definition.implementation,
    configContract: definition.configContract,
    enable:
      definition.enableRss ||
      definition.enableAutomaticSearch ||
      definition.enableInteractiveSearch,
    message: null,
    tags: definition.tags,
    settings: definition.settings,
    enableRss: definition.enableRss,
    enableAutomaticSearch: definition.enableAutomaticSearch,
    enableInteractiveSearch: definition.enableInteractiveSearch,
    priority: definition.priority,
    downloadClientId: definition.downloadClientId,
  };
}

/**
 * `ProviderDefinition (+ optional Indexer fields) -> IndexerDefinition`.
 * Reads `enableRss`/`enableAutomaticSearch`/`enableInteractiveSearch`/
 * `priority`/`downloadClientId` directly off the input when present
 * (`IndexerProviderDefinition`'s own fields), falling back to
 * `DEFAULT_INDEXER_FIELDS` only for a bare generic `ProviderDefinition`
 * that never went through this module's own mapping (defensive default,
 * not expected on any real request path through IndexerController.ts).
 */
export function toIndexerDefinition(
  providerDefinition: ProviderDefinition<IProviderConfig> | IndexerProviderDefinition
): IndexerDefinition {
  const extra = "enableRss" in providerDefinition ? providerDefinition : DEFAULT_INDEXER_FIELDS;

  return createIndexerDefinition({
    id: providerDefinition.id,
    name: providerDefinition.name,
    implementation: providerDefinition.implementation,
    configContract: providerDefinition.configContract,
    settings: providerDefinition.settings,
    tags: providerDefinition.tags,
    enableRss: extra.enableRss,
    enableAutomaticSearch: extra.enableAutomaticSearch,
    enableInteractiveSearch: extra.enableInteractiveSearch,
    priority: extra.priority,
    downloadClientId: extra.downloadClientId,
  });
}

// ---- IIndexer <-> IProvider -------------------------------------------------

/** Wraps a real `IIndexer` instance as an `IProvider<IProviderConfig>`. `defaultDefinitions`/`definition` are converted via `toProviderDefinition`; `test`/`requestAction` delegate straight through. */
export function toProviderInstance(indexer: IIndexer): IProvider<IProviderConfig> {
  return {
    name: indexer.name,
    configContract: indexer.definition.configContract ?? "",
    message: null,
    get defaultDefinitions(): ProviderDefinition<IProviderConfig>[] {
      return [toProviderDefinition(indexer.definition)];
    },
    get definition(): ProviderDefinition<IProviderConfig> {
      return toProviderDefinition(indexer.definition);
    },
    set definition(value: ProviderDefinition<IProviderConfig>) {
      indexer.definition = toIndexerDefinition(value);
    },
    test: () => indexer.test(),
    requestAction: (stage, query) => indexer.requestAction(stage, query),
  };
}

// ---- IIndexerRepository -> IProviderRepository -----------------------------

/**
 * Adapts `IIndexerRepository` (real, `IndexerRepository.ts`) to
 * `IProviderRepository<ProviderDefinition<IProviderConfig>>`, round-tripping
 * every CRUD call through `IndexerProviderDefinition` (see this module's
 * doc comment).
 */
export class ProviderRepositoryAdapter implements IProviderRepository<
  ProviderDefinition<IProviderConfig>
> {
  constructor(private readonly repository: IIndexerRepository) {}

  all(): ProviderDefinition<IProviderConfig>[] {
    return this.repository.all().map(toProviderDefinition);
  }

  find(id: number): ProviderDefinition<IProviderConfig> | undefined {
    const model = this.repository.find(id);
    return model ? toProviderDefinition(model) : undefined;
  }

  get(id: number): ProviderDefinition<IProviderConfig> {
    return toProviderDefinition(this.repository.get(id));
  }

  getMany(ids: number[]): ProviderDefinition<IProviderConfig>[] {
    return this.repository.getMany(ids).map(toProviderDefinition);
  }

  insert(model: ProviderDefinition<IProviderConfig>): ProviderDefinition<IProviderConfig> {
    const indexerModel = toIndexerDefinition(model);
    const inserted = this.repository.insert(indexerModel);
    return toProviderDefinition(inserted);
  }

  update(model: ProviderDefinition<IProviderConfig>): ProviderDefinition<IProviderConfig> {
    const indexerModel = toIndexerDefinition(model);
    const updated = this.repository.update(indexerModel);
    return toProviderDefinition(updated);
  }

  updateMany(models: ProviderDefinition<IProviderConfig>[]): void {
    for (const model of models) {
      this.update(model);
    }
  }

  upsert(model: ProviderDefinition<IProviderConfig>): ProviderDefinition<IProviderConfig> {
    return model.id === 0 ? this.insert(model) : this.update(model);
  }

  delete(id: number): void {
    this.repository.delete(id);
  }

  deleteMany(ids: number[]): void {
    for (const id of ids) {
      this.repository.delete(id);
    }
  }

  count(): number {
    return this.repository.count();
  }
}

// ---- IIndexerFactory -> IProviderFactory -----------------------------------

/** Minimal logger surface, matching this repo's `noopLogger`-by-default convention (e.g. ProviderFactory.ts's `ProviderFactoryLogger`). */
export interface IndexerProviderFactoryLogger {
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

const noopLogger: IndexerProviderFactoryLogger = {
  debug: () => {},
  trace: () => {},
  warn: () => {},
};

/**
 * Adapts the real, narrow `IIndexerFactory` (indexers/IndexerFactory.ts --
 * only `rssEnabled`/`automaticSearchEnabled`/`interactiveSearchEnabled`/
 * `test`) plus the real `IIndexerRepository` into the FULL
 * `IProviderFactory<IProvider<IProviderConfig>, IProviderConfig>` surface
 * `providerControllerBase` requires. CRUD (`create`/`update`/`delete`/
 * `getMany`/etc.) delegates to `ProviderRepositoryAdapter` (the repository
 * IS the source of truth for CRUD in both the real C# `ProviderFactory` base
 * and this port's own `thingi-provider/ProviderFactory.ts`); `test`/
 * `requestAction` delegate to the real `IIndexerFactory.test()` /
 * (per-instance) `IIndexer.requestAction()` so indexer-status-service
 * escalation bookkeeping (IndexerFactory.ts's `test()`) stays wired through
 * unmodified; `getAvailableProviders`/`getDefaultDefinitions`/
 * `getPresetDefinitions`/`getInstance`/`setProviderCharacteristics` are
 * implemented directly here against the injected live `IIndexer[]` list,
 * mirroring `thingi-provider/ProviderFactory.ts`'s own real implementations
 * of those same methods (this adapter re-implements them instead of
 * delegating, since the narrow `IIndexerFactory` doesn't expose them at
 * all).
 */
export class IndexerProviderFactoryAdapter implements IProviderFactory<
  IProvider<IProviderConfig>,
  IProviderConfig
> {
  private readonly repositoryAdapter: ProviderRepositoryAdapter;

  constructor(
    private readonly indexerFactory: IIndexerFactory,
    repository: IIndexerRepository,
    /** Live `IIndexer` instances, keyed by lowercased `Implementation` name -- the same "explicit factory-function registry, no reflection" pattern `thingi-provider/ProviderFactory.ts` itself uses. */
    private readonly implementationFactories: Map<string, () => IIndexer>,
    private readonly logger: IndexerProviderFactoryLogger = noopLogger
  ) {
    this.repositoryAdapter = new ProviderRepositoryAdapter(repository);
  }

  all(): ProviderDefinition<IProviderConfig>[] {
    return this.repositoryAdapter.all();
  }

  find(id: number): ProviderDefinition<IProviderConfig> | undefined {
    return this.repositoryAdapter.find(id);
  }

  get(id: number): ProviderDefinition<IProviderConfig> {
    return this.repositoryAdapter.get(id);
  }

  getMany(ids: number[]): ProviderDefinition<IProviderConfig>[] {
    return this.repositoryAdapter.getMany(ids);
  }

  create(definition: ProviderDefinition<IProviderConfig>): ProviderDefinition<IProviderConfig> {
    return this.repositoryAdapter.insert(definition);
  }

  update(definition: ProviderDefinition<IProviderConfig>): void {
    this.repositoryAdapter.update(definition);
  }

  updateMany(
    definitions: ProviderDefinition<IProviderConfig>[]
  ): ProviderDefinition<IProviderConfig>[] {
    this.repositoryAdapter.updateMany(definitions);
    return definitions;
  }

  delete(id: number): void {
    this.repositoryAdapter.delete(id);
  }

  deleteMany(ids: number[]): void {
    this.repositoryAdapter.deleteMany(ids);
  }

  exists(id: number): boolean {
    return this.repositoryAdapter.find(id) !== undefined;
  }

  allForTag(tagId: number): ProviderDefinition<IProviderConfig>[] {
    return this.all().filter((p) => p.tags.includes(tagId));
  }

  /** Ported from `ProviderFactory.GetInstance()` -- see this class's doc comment. */
  getInstance(definition: ProviderDefinition<IProviderConfig>): IProvider<IProviderConfig> {
    const factory = this.implementationFactories.get(definition.implementation.toLowerCase());
    if (!factory) {
      throw new Error(`Unknown provider implementation "${definition.implementation}"`);
    }

    const indexer = factory();
    indexer.definition = toIndexerDefinition(definition);

    const provider = toProviderInstance(indexer);
    definition.implementationName = provider.name;
    definition.message = provider.message;
    return provider;
  }

  setProviderCharacteristics(definition: ProviderDefinition<IProviderConfig>): void {
    this.getInstance(definition);
  }

  /** Ported from `ProviderFactory.GetDefaultDefinitions()` -- see thingi-provider/ProviderFactory.ts's own doc comment for the full algorithm this mirrors. */
  getDefaultDefinitions(): ProviderDefinition<IProviderConfig>[] {
    const result: ProviderDefinition<IProviderConfig>[] = [];

    for (const [, makeIndexer] of this.implementationFactories) {
      const indexer = makeIndexer();
      const defaultDefinition: IndexerProviderDefinition = {
        ...createProviderDefinition<IProviderConfig>({
          name: "",
          configContract: indexer.definition?.configContract ?? null,
          implementation: indexer.name,
          settings: indexer.definition?.settings ?? null,
        }),
        ...DEFAULT_INDEXER_FIELDS,
      };

      defaultDefinition.implementationName = indexer.name;
      result.push(defaultDefinition);
    }

    return result;
  }

  /** Ported from `ProviderFactory.GetPresetDefinitions()`. This port registers exactly one definition per implementation (no named presets beyond the bare default) -- see `IndexerSettingsSchema.ts`'s doc comment for why Newznab/Torznab have no preset indexer list bundled in this scope. */
  getPresetDefinitions(
    _providerDefinition: ProviderDefinition<IProviderConfig>
  ): ProviderDefinition<IProviderConfig>[] {
    return [];
  }

  getAvailableProviders(): IProvider<IProviderConfig>[] {
    return this.all()
      .filter((d) => d.settings?.validate().isValid ?? false)
      .map((d) => this.getInstance(d));
  }

  async test(definition: ProviderDefinition<IProviderConfig>): Promise<ValidationResult> {
    const indexerDefinition = toIndexerDefinition(definition);

    this.logger.debug("Testing indexer %s", definition.name);

    return this.indexerFactory.test(indexerDefinition);
  }

  requestAction(
    definition: ProviderDefinition<IProviderConfig>,
    action: string,
    query: Record<string, string>
  ): unknown {
    const provider = this.getInstance(definition);
    return provider.requestAction(action, query);
  }
}
