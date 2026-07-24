import type { Router } from "express";
import type { IIndexer, IIndexerFactory, IIndexerRepository } from "../../../indexers/index.js";
import { DownloadProtocol } from "../../../indexers/index.js";
import type { IProvider, IProviderConfig } from "../../../thingi-provider/index.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import { providerControllerBase } from "../../rest/ProviderControllerBase.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import type { ProviderResource, ProviderSettingsSchema } from "../../rest/ProviderResource.js";
import { IndexerProviderFactoryAdapter, type IndexerProviderDefinition } from "./IndexerAdapter.js";
import { indexerBulkUpdateModel } from "./IndexerBulkResource.js";
import { indexerResourceMapper, type IndexerResource } from "./IndexerResource.js";
import {
  createDefaultNewznabSettings,
  createDefaultTorznabSettings,
  NEWZNAB_FIELD_DEFS,
  TORZNAB_FIELD_DEFS,
} from "./IndexerSettingsSchema.js";

/**
 * Ported from Readarr.Api.V1/Indexers/IndexerController.cs.
 *
 * ```csharp
 * public class IndexerController : ProviderControllerBase<IndexerResource, IndexerBulkResource, IIndexer, IndexerDefinition>
 * {
 *     public IndexerController(IndexerFactory indexerFactory, DownloadClientExistsValidator downloadClientExistsValidator)
 *         : base(indexerFactory, "indexer", ResourceMapper, BulkResourceMapper)
 *     {
 *         SharedValidator.RuleFor(c => c.Priority).InclusiveBetween(1, 50);
 *         SharedValidator.RuleFor(c => c.DownloadClientId).SetValidator(downloadClientExistsValidator);
 *     }
 * }
 * ```
 *
 * ## The `providerControllerBase` mapper seam (fixed during merge
 * reconciliation -- previously a documented gap, worked around here; now
 * uses the real seam directly)
 *
 * `rest/ProviderControllerBase.ts`'s `providerControllerBase()` now takes an
 * optional `resourceMapper` option (mirroring the real C# base class's
 * `TProviderResourceMapper ResourceMapper` constructor argument) so a
 * concrete controller like this one can supply its own `ToResource`/
 * `ToModel` pair that adds extra top-level resource fields
 * (`EnableRss`/`EnableAutomaticSearch`/`EnableInteractiveSearch`/
 * `SupportsRss`/`SupportsSearch`/`Protocol`/`Priority`/`DownloadClientId` --
 * see IndexerResource.cs) beyond the generic `Fields: List<Field>` settings
 * array `providerResourceMapper` alone handles. This controller now
 * delegates its ENTIRE router straight to a single
 * `providerControllerBase({ ..., resourceMapper })` call --
 * `dispatchingIndexerResourceMapper()` below is the `resourceMapper` this
 * controller supplies, wrapping `indexerResourceMapper()`
 * (IndexerResource.ts) with per-implementation settings-schema dispatch
 * (`schemaFor()`) since a single Indexer definition's settings shape
 * (Newznab vs Torznab) isn't known until its `implementation` field is
 * read -- the real C#'s reflection-based `SchemaBuilder` doesn't need this
 * dispatch (it resolves the settings type from the live object's own
 * runtime type), but this port's field-definition-array-based
 * `SchemaBuilder.ts` does.
 *
 * The previous version of this controller re-implemented `GET /`, `GET
 * /:id`, `GET /schema`, `POST /`, `PUT /:id`, `PUT /bulk` directly (bypassing
 * `providerControllerBase()` for those routes, mounting its base-router
 * result underneath via `router.use(baseRouter)` for the remaining routes)
 * because the seam didn't exist yet. All of that re-implementation is gone
 * now that the real seam exists -- see this task's final report for the
 * before/after.
 */

const SHARED_IMPLEMENTATIONS: Array<{
  key: string;
  protocol: DownloadProtocol;
  supportsRss: boolean;
  supportsSearch: boolean;
}> = [
  { key: "newznab", protocol: DownloadProtocol.Usenet, supportsRss: true, supportsSearch: true },
  { key: "torznab", protocol: DownloadProtocol.Torrent, supportsRss: true, supportsSearch: true },
];

/** Ported from `ProviderFactory.SetProviderCharacteristics`: `Protocol` is read off the live `IIndexer` instance, not the definition. */
function protocolFor(implementation: string): DownloadProtocol {
  const match = SHARED_IMPLEMENTATIONS.find((i) => i.key === implementation.toLowerCase());
  return match?.protocol ?? DownloadProtocol.Unknown;
}

/** Ported from the same characteristic-stamping as `protocolFor` -- `SupportsRss` is read off the live `IIndexer` instance. Every registered implementation in this port's scope (Newznab/Torznab) always reports `true` (see indexers/HttpIndexerBase.ts's `supportsRss` override), so this is a constant lookup by implementation name rather than instantiating a throwaway provider per definition. */
function supportsRssFor(implementation: string): boolean {
  return SHARED_IMPLEMENTATIONS.some(
    (i) => i.key === implementation.toLowerCase() && i.supportsRss
  );
}

/** See `supportsRssFor`'s doc comment -- same rationale for `SupportsSearch`. */
function supportsSearchFor(implementation: string): boolean {
  return SHARED_IMPLEMENTATIONS.some(
    (i) => i.key === implementation.toLowerCase() && i.supportsSearch
  );
}

/**
 * Ported from `DownloadClientExistsValidator`
 * (NzbDrone.Core/Validation/DownloadClientExistsValidator.cs). The real
 * validator's `IDownloadClientFactory` (`DownloadClient` module) isn't
 * ported in this worktree's scope (a sibling group's own file set) --
 * narrowed to the one method (`exists(id)`) this rule calls, matching every
 * other forward-reference in this codebase. `0`/absent always passes
 * (matches the real `PropertyValue == null || (int)PropertyValue == 0 ->
 * true` short-circuit). When no factory is injected at all, this defaults
 * to a permissive check (every id passes) -- there is no download-client
 * registry to validate against yet in this task's scope, and refusing every
 * non-zero DownloadClientId would make the indexer API unusable for any
 * caller until the DownloadClients sibling group lands; a caller wiring
 * this controller into the real app once DownloadClients exists should
 * inject the real factory's `.exists()` here.
 */
export interface DownloadClientExistsCheck {
  exists(id: number): boolean;
}

const permissiveDownloadClientCheck: DownloadClientExistsCheck = { exists: () => true };

/** Ported from the ctor's `SharedValidator.RuleFor(c => c.Priority).InclusiveBetween(1, 50)` + `RuleFor(c => c.DownloadClientId).SetValidator(downloadClientExistsValidator)`. */
function buildSharedValidator(
  downloadClientExists: DownloadClientExistsCheck
): ResourceValidator<ProviderResource> {
  return (resource) => {
    const indexerResource = resource as IndexerResource;
    const failures: ValidationFailure[] = [];

    if (
      typeof indexerResource.priority !== "number" ||
      indexerResource.priority < 1 ||
      indexerResource.priority > 50
    ) {
      failures.push({
        propertyName: "priority",
        errorMessage: `'Priority' must be between 1 and 50. You entered ${String(indexerResource.priority)}`,
      });
    }

    if (
      indexerResource.downloadClientId &&
      indexerResource.downloadClientId !== 0 &&
      !downloadClientExists.exists(indexerResource.downloadClientId)
    ) {
      failures.push({
        propertyName: "downloadClientId",
        errorMessage: "Download Client does not exist",
      });
    }

    return failures;
  };
}

// NOTE: this controller used to duplicate the base ctor's
// `PostValidator.RuleFor(c => c.Fields).NotNull()` / `SharedValidator.RuleFor
// (c => c.Name).NotEmpty()`/`.Must(unique)`/`RuleFor(c => c.Implementation)
// .NotEmpty()`/`RuleFor(c => c.ConfigContract).NotEmpty()` base rules locally
// (as `postValidator`/`baseSharedValidator`) because it bypassed
// `providerControllerBase()`'s own create/update routes entirely. Now that
// this controller delegates its whole router to a single
// `providerControllerBase()` call (see the `resourceMapper` seam doc comment
// above), those base rules run there unconditionally -- `extraSharedValidator:
// buildSharedValidator(downloadClientExists)` below just adds this
// controller's OWN extra rules (Priority range, DownloadClientId existence)
// on top via `combineValidators`, and the local duplicates were deleted.

/**
 * `FieldDefinition<TSettings>` is contravariant in its `set(settings,
 * value)` parameter, so `FieldDefinition<NewznabSettings>[]` is not a
 * structural subtype of `FieldDefinition<IProviderConfig>[]` (TS correctly
 * refuses a direct assignment -- a caller of the wider type could pass a
 * bare `IProviderConfig` into a setter that expects a real
 * `NewznabSettings`). This is safe in practice ONLY because
 * `schemaFor()`/`dispatchingIndexerResourceMapper()` always pair a given implementation's
 * `FieldDefinition[]` with settings objects created by that SAME
 * implementation's `createDefaultSettings`/`readFromFieldSchema` factory
 * (never a mismatched pairing) -- the `unknown` round-trip below documents
 * that this narrowing is intentional, not an oversight.
 */
function widenSettingsSchema<TSettings extends IProviderConfig>(
  schema: ProviderSettingsSchema<TSettings>
): ProviderSettingsSchema<IProviderConfig> {
  return schema as unknown as ProviderSettingsSchema<IProviderConfig>;
}

const INDEXER_SETTINGS_SCHEMAS: Record<string, ProviderSettingsSchema<IProviderConfig>> = {
  newznab: widenSettingsSchema({
    fieldDefs: NEWZNAB_FIELD_DEFS,
    createDefaultSettings: createDefaultNewznabSettings,
  }),
  torznab: widenSettingsSchema({
    fieldDefs: TORZNAB_FIELD_DEFS,
    createDefaultSettings: createDefaultTorznabSettings,
  }),
};

/** Picks the per-implementation `FieldDefinition[]`/factory (Newznab vs Torznab settings shapes differ -- see IndexerSettingsSchema.ts) by the definition/resource's own `implementation` name. Falls back to Newznab's schema for an unknown implementation. */
function schemaFor(implementation: string): ProviderSettingsSchema<IProviderConfig> {
  return (
    INDEXER_SETTINGS_SCHEMAS[implementation.toLowerCase()] ?? INDEXER_SETTINGS_SCHEMAS["newznab"]!
  );
}

export interface IndexerControllerOptions {
  indexerFactory: IIndexerFactory;
  indexerRepository: IIndexerRepository;
  /** Live-instance registry, keyed by lowercased `Implementation` -- see IndexerAdapter.ts's `IndexerProviderFactoryAdapter` doc comment for why this replaces DI/reflection-based provider construction. */
  implementationFactories: Map<string, () => IIndexer>;
  downloadClientExists?: DownloadClientExistsCheck;
  wikiSlug?: string;
}

/**
 * The `resourceMapper` this controller supplies to `providerControllerBase()`
 * -- wraps `indexerResourceMapper()` (IndexerResource.ts) with
 * per-implementation settings-schema dispatch. See this module's doc
 * comment's "mapper seam" section for why the dispatch is needed at all.
 *
 * `toResource`/`toModel` each resolve the right schema off the definition's/
 * resource's own `implementation` field respectively -- exactly the two
 * contexts the old `mapperFor()` helper was called from, now expressed as
 * the single `{toResource, toModel}` pair `providerControllerBase()`'s
 * `resourceMapper` option expects.
 */
function dispatchingIndexerResourceMapper(wikiSlug: string): {
  toResource: (definition: IndexerProviderDefinition) => IndexerResource;
  toModel: (resource: IndexerResource | null | undefined) => IndexerProviderDefinition;
} {
  const characteristics = {
    supportsRss: (d: IndexerProviderDefinition) => supportsRssFor(d.implementation),
    supportsSearch: (d: IndexerProviderDefinition) => supportsSearchFor(d.implementation),
    protocol: (d: IndexerProviderDefinition) => protocolFor(d.implementation),
  };

  return {
    toResource(definition) {
      return indexerResourceMapper(
        schemaFor(definition.implementation),
        characteristics,
        wikiSlug
      ).toResource(definition);
    },
    toModel(resource) {
      const implementation = resource?.implementation ?? "";
      return indexerResourceMapper(schemaFor(implementation), characteristics, wikiSlug).toModel(
        resource
      );
    },
  };
}

/**
 * Builds the `IndexerController` Express router. See this module's doc
 * comment for the `resourceMapper` seam this now uses directly.
 */
export function indexerController(options: IndexerControllerOptions): Router {
  const {
    indexerFactory,
    indexerRepository,
    implementationFactories,
    downloadClientExists = permissiveDownloadClientCheck,
    wikiSlug = "readarr",
  } = options;

  const providerFactory = new IndexerProviderFactoryAdapter(
    indexerFactory,
    indexerRepository,
    implementationFactories
  );

  return providerControllerBase<
    IProvider<IProviderConfig>,
    IProviderConfig,
    IndexerResource,
    IndexerProviderDefinition
  >({
    providerFactory,
    // Unused for mapping once `resourceMapper` is supplied below (see
    // ProviderControllerBase.ts's doc comment: `settingsSchema` only backs
    // the internally-constructed DEFAULT mapper) -- still required by
    // `ProviderControllerOptions`'s shape, so Newznab's schema is passed as
    // a representative placeholder, same as this controller used to pass
    // to the old `baseRouter` for its DELETE/test/testall/action routes.
    settingsSchema: INDEXER_SETTINGS_SCHEMAS["newznab"]!,
    wikiSlug,
    extraSharedValidator: buildSharedValidator(downloadClientExists),
    updateBulkModel: indexerBulkUpdateModel,
    resourceMapper: dispatchingIndexerResourceMapper(wikiSlug),
  });
}
