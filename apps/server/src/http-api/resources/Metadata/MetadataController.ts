import type { Router } from "express";
import type { IMetadata } from "../../../extras/metadata/metadataBase.js";
import type { MetadataDefinition } from "../../../extras/metadata/metadataDefinition.js";
import { createMetadataDefinition } from "../../../extras/metadata/metadataDefinition.js";
import type { IMetadataRepository } from "../../../extras/metadata/metadataRepository.js";
import {
  ProviderFactory,
  type IProvider,
  type IProviderConfig,
  type IProviderRepository,
  type ProviderDefinition,
  type ProviderFactoryEventAggregator,
  type ProviderFactoryLogger,
  type ProviderMessage,
} from "../../../thingi-provider/index.js";
import { providerControllerBase } from "../../rest/ProviderControllerBase.js";
import {
  extraFieldsProviderResourceMapper,
  type ProviderSettingsSchema,
} from "../../rest/ProviderResource.js";
import { METADATA_EXTRA_FIELDS, type MetadataResource } from "./MetadataResource.js";

/**
 * Ported from Readarr.Api.V1/Metadata/MetadataController.cs.
 *
 * ```
 * public class MetadataController : ProviderControllerBase<MetadataResource, MetadataBulkResource, IMetadata, MetadataDefinition>
 * {
 *     public MetadataController(IMetadataFactory metadataFactory)
 *         : base(metadataFactory, "metadata", ResourceMapper, BulkResourceMapper)
 *     {
 *     }
 *
 *     [NonAction] public override ActionResult<MetadataResource> UpdateProvider([FromBody] MetadataBulkResource providerResource) => throw new NotImplementedException();
 *     [NonAction] public override object DeleteProviders([FromBody] MetadataBulkResource resource) => throw new NotImplementedException();
 * }
 * ```
 *
 * ## CRITICAL FINDING: "Metadata" here means the DISK-WRITING provider kind
 * (NzbDrone.Core/Extras/Metadata/), NOT the metadata-FETCHING modules
 *
 * Confirmed directly against both this port's own module layout and the
 * real Readarr C# source tree before writing a line of this controller:
 *
 *   - `apps/server/src/metadata-source/` (Hardcover/OpenLibrary/Google Books)
 *     is the port of `NzbDrone.Core/MetadataSource/` -- author/book/series
 *     LOOKUP providers (search, `IProvideAuthorInfo`/`IProvideBookInfo`).
 *     UNRELATED to this controller. Confirmed by directory diff: `Metadata`
 *     and `MetadataSource` are two entirely separate real C# namespaces
 *     with no shared base classes.
 *   - `apps/server/src/extras/metadata/` (Phase 3, already merged, barrel-
 *     exported from `extras/index.ts`) is the REAL port of
 *     `NzbDrone.Core/Extras/Metadata/` -- the disk-WRITING provider kind
 *     this controller is actually for (`IMetadata`/`MetadataBase`/
 *     `MetadataFactory`/`MetadataDefinition`/`MetadataRepository`/
 *     `MetadataService`, matching `NzbDrone.Core.Extras.Metadata`'s own
 *     class-for-class shape). This is NOT a gap requiring new domain
 *     modules -- the backing service genuinely already exists, just filed
 *     under `extras/metadata/` (grouped with the sibling `extras/others/`
 *     companion-file module at Phase 3) rather than a top-level
 *     `metadata/` directory.
 *
 * ## The REAL gap: no concrete `IMetadata` writer implementations exist
 * anywhere -- confirmed against the real C# source, not a porting omission
 *
 * Grepped this port's `apps/server/src` AND the real Readarr C# source tree
 * (`NzbDrone.Core/Extras/Metadata/` -- every top-level `.cs` file: only
 * `ExistingMetadataImporter`/`IMetadata`/`MetadataBase`/`MetadataDefinition`/
 * `MetadataFactory`/`MetadataRepository`/`MetadataSectionType`/
 * `MetadataService`/`MetadataType`, plus a `Files/` subdirectory of pure
 * support classes) for any class extending `MetadataBase<T>` or
 * implementing `IMetadata` directly. NONE exist -- not in this port, not in
 * the real upstream Readarr source at this snapshot. Unlike DownloadClient/
 * Notifications (which each have real, concrete, already-ported
 * implementations this controller wires up), there is LITERALLY NOTHING to
 * register as a provider here in either codebase. `GET /schema` will
 * correctly return an empty array; `GET /`/`POST /` will work but have no
 * real providers to create definitions against unless/until a caller
 * registers one (this controller accepts an empty `providers: []` as a
 * fully valid default).
 *
 * ## Adapter layer -- narrower gaps than DownloadClient's, but real ones
 *
 * `apps/server/src/extras/metadata/metadataFactory.ts`'s `IMetadataFactory`
 * is a hand-rolled, narrow factory (predates `thingi-provider/`, same
 * "FORWARD-REFERENCE NARROWING" situation `IndexerFactory`/
 * `DownloadClientFactory` document) -- NOT modified here (out of scope,
 * owned by the already-merged extras module). `MetadataDefinition`
 * (`extras/metadata/metadataDefinition.ts`) is missing THREE fields plain
 * `ProviderDefinition` requires (`implementationName`/`message`/`tags` --
 * verified directly via `tsc`, same class of gap as `DownloadClientDefinition`'s
 * missing `implementationName`/`message`, one field wider here). `IMetadata`
 * (`extras/metadata/metadataBase.ts`) is missing `configContract`/`message`/
 * `defaultDefinitions`/`requestAction` AND its `test()` is SYNCHRONOUS
 * (`ValidationResult`, not `Promise<ValidationResult>`) where `IProvider.test()`
 * requires async -- a strictly wider gap than `IDownloadClient`'s (which at
 * least had an async `test()`).
 *
 * `adaptMetadataRepository`/`adaptMetadata` below close these gaps the same
 * way `DownloadClientController.ts`'s `adaptDownloadClientRepository`/
 * `adaptDownloadClient` do: synthesize the missing fields (`implementationName`
 * defaults to the bare `implementation` string, `message`/`tags` default to
 * `null`/`[]` -- none of which the real C# persists as real columns either),
 * and wrap `test()` in `Promise.resolve(...)` to satisfy the async contract
 * (a synchronous `ValidationResult` trivially satisfies
 * `Promise<ValidationResult>` once wrapped -- no behavior change, `IMetadata.
 * test()` was never actually async work to begin with; see `MetadataBase.ts`'s
 * own doc comment: it's always-valid, never overridden by any concrete
 * consumer in the real source either).
 *
 * ## Bulk routes: same [NonAction] situation as Notifications
 *
 * See `MetadataBulkResource.ts`'s doc comment.
 */

function defaultDefinitionFor(implementation: string, configContract: string): MetadataDefinition {
  return createMetadataDefinition({ name: "", implementation, configContract, enable: false });
}

/** Synthesizes `implementationName`/`message`/`tags` (missing from `MetadataDefinition` -- see module doc comment) and widens `settings` from `Record<string, unknown> | null` to `IProviderConfig | null` (a metadata consumer's settings, if any, still needs a `validate()` -- defaulted to always-valid when absent, matching `MetadataBase.test()`'s own "always valid" behavior for the settings-less case every real consumer in this port's/the real C#'s current scope has). */
function toProviderDefinition(definition: MetadataDefinition): ProviderDefinition<IProviderConfig> {
  const settings = definition.settings as (IProviderConfig & Record<string, unknown>) | null;
  return {
    id: definition.id,
    name: definition.name,
    implementationName: definition.implementation,
    implementation: definition.implementation,
    configContract: definition.configContract,
    enable: definition.enable,
    message: null,
    tags: [],
    settings: settings
      ? {
          ...settings,
          validate: settings.validate
            ? settings.validate.bind(settings)
            : () => ({ isValid: true, hasWarnings: false, errors: [] }),
        }
      : null,
  };
}

function toMetadataDefinition(definition: ProviderDefinition<IProviderConfig>): MetadataDefinition {
  return createMetadataDefinition({
    id: definition.id,
    name: definition.name,
    implementation: definition.implementation,
    configContract: definition.configContract,
    enable: definition.enable,
    settings: definition.settings as Record<string, unknown> | null,
  });
}

/** Wraps the real, unmodified `IMetadataRepository` as an `IProviderRepository<ProviderDefinition<IProviderConfig>>` -- see `toProviderDefinition`/`toMetadataDefinition` doc comment. `updateMany`/`deleteMany` are synthesized from the repository's own single-row `update`/`delete` (the real `IMetadataRepository` has no batch equivalents -- see that interface); `upsert` branches on `id === 0` the same way every other repository in this port's `upsert` does. */
function adaptMetadataRepository(
  repository: IMetadataRepository
): IProviderRepository<ProviderDefinition<IProviderConfig>> {
  return {
    all: () => repository.all().map(toProviderDefinition),
    find: (id) => {
      const found = repository.find(id);
      return found ? toProviderDefinition(found) : undefined;
    },
    get: (id) => toProviderDefinition(repository.get(id)),
    getMany: (ids) => repository.getMany(ids).map(toProviderDefinition),
    insert: (model) => toProviderDefinition(repository.insert(toMetadataDefinition(model))),
    update: (model) => toProviderDefinition(repository.update(toMetadataDefinition(model))),
    updateMany: (models) => {
      for (const model of models) {
        repository.update(toMetadataDefinition(model));
      }
    },
    upsert: (model) => {
      const metadataDefinition = toMetadataDefinition(model);
      const result =
        metadataDefinition.id === 0
          ? repository.insert(metadataDefinition)
          : repository.update(metadataDefinition);
      return toProviderDefinition(result);
    },
    delete: (id) => {
      repository.delete(id);
    },
    deleteMany: (ids) => {
      for (const id of ids) {
        repository.delete(id);
      }
    },
    count: () => repository.count(),
  };
}

/** Adapts a real `IMetadata` consumer to `IProvider<IProviderConfig>` -- see module doc comment's "Adapter layer" section for exactly which members are synthesized/wrapped and why. */
function adaptMetadata(
  metadata: IMetadata,
  implementation: string,
  configContract: string
): IProvider<IProviderConfig> {
  let currentDefinition: ProviderDefinition<IProviderConfig> = toProviderDefinition(
    defaultDefinitionFor(implementation, configContract)
  );

  return {
    get name(): string {
      return metadata.name;
    },
    get configContract(): string {
      return configContract;
    },
    get message(): ProviderMessage | null {
      return null;
    },
    get defaultDefinitions(): ProviderDefinition<IProviderConfig>[] {
      return [toProviderDefinition(defaultDefinitionFor(implementation, configContract))];
    },
    get definition(): ProviderDefinition<IProviderConfig> {
      return currentDefinition;
    },
    set definition(value: ProviderDefinition<IProviderConfig>) {
      currentDefinition = value;
    },
    // Ported: `MetadataBase.Test()` is synchronous in this port (see
    // `metadataBase.ts`'s doc comment) -- `IProvider.test()` requires
    // `Promise<ValidationResult>`; wrapping via `Promise.resolve(...)` is a
    // no-op adaptation (no real async work either way, matching the real
    // C# base's always-`new ValidationResult()` -- i.e. always-valid --
    // body that no concrete consumer overrides).
    test: () => Promise.resolve(metadata.test()),
    // Ported: `IMetadata` has no `requestAction` at all (never needed one
    // -- no concrete consumer exists to need it, see module doc comment) --
    // matches `IProvider.requestAction`'s real C# base behavior for a
    // provider kind with no registered actions: an empty response.
    requestAction: () => ({}),
  };
}

export interface MetadataControllerOptions {
  repository: IMetadataRepository;
  /** Live `IMetadata` consumer instances -- see module doc comment: NONE exist in this port (or the real upstream Readarr source at this snapshot), so `[]` is the fully valid default until/unless a concrete writer is ported later. */
  providers?: { metadata: IMetadata; implementation: string; configContract: string }[];
  eventAggregator?: ProviderFactoryEventAggregator;
  logger?: ProviderFactoryLogger;
}

export function metadataController(options: MetadataControllerOptions): Router {
  const { repository } = options;
  const providers = options.providers ?? [];

  const implementationFactories = new Map<string, () => IProvider<IProviderConfig>>();
  const adaptedProviders: IProvider<IProviderConfig>[] = [];

  for (const { metadata, implementation, configContract } of providers) {
    const adapted = adaptMetadata(metadata, implementation, configContract);
    implementationFactories.set(implementation.toLowerCase(), () => adapted);
    adaptedProviders.push(adapted);
  }

  const factory = new ProviderFactory<IProvider<IProviderConfig>, IProviderConfig>(
    adaptMetadataRepository(repository),
    adaptedProviders,
    implementationFactories,
    options.eventAggregator,
    options.logger
  );

  const settingsSchema: ProviderSettingsSchema<IProviderConfig> = {
    fieldDefs: [],
    // Ported: no real settings type exists to default to (no concrete
    // consumer in this port's/the real C#'s current scope has ANY
    // settings fields at all -- see module doc comment). An empty,
    // always-valid `IProviderConfig` is the only faithful default given
    // there is nothing real to instantiate.
    createDefaultSettings: () => ({
      validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
    }),
  };

  return providerControllerBase<
    IProvider<IProviderConfig>,
    IProviderConfig,
    MetadataResource,
    ProviderDefinition<IProviderConfig>
  >({
    providerFactory: factory,
    settingsSchema,
    resourceMapper: extraFieldsProviderResourceMapper(settingsSchema, METADATA_EXTRA_FIELDS),
  });
}
