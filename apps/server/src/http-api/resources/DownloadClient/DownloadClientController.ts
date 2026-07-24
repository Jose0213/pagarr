import type { Router } from "express";
import type {
  IDownloadClient,
  IDownloadClientRepository,
} from "../../../download-clients/index.js";
import type { DownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import { createQBittorrentSettings } from "../../../download-clients/qbittorrent/QBittorrentSettings.js";
import { createSabnzbdSettings } from "../../../download-clients/sabnzbd/SabnzbdSettings.js";
import { createTorrentBlackholeSettings } from "../../../download-clients/blackhole/TorrentBlackholeSettings.js";
import { createUsenetBlackholeSettings } from "../../../download-clients/blackhole/UsenetBlackholeSettings.js";
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
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import {
  extraFieldsProviderResourceMapper,
  type ProviderResource,
  type ProviderSettingsSchema,
} from "../../rest/ProviderResource.js";
import { unionFieldDefs } from "../genericProviderFieldSchema.js";
import { applyDownloadClientBulkUpdate } from "./DownloadClientBulkResource.js";
import {
  DOWNLOAD_CLIENT_EXTRA_FIELDS,
  type DownloadClientResource,
} from "./DownloadClientResource.js";

/**
 * Ported from Readarr.Api.V1/DownloadClient/DownloadClientController.cs.
 *
 * ```
 * public class DownloadClientController : ProviderControllerBase<DownloadClientResource, DownloadClientBulkResource, IDownloadClient, DownloadClientDefinition>
 * {
 *     public DownloadClientController(IDownloadClientFactory downloadClientFactory)
 *         : base(downloadClientFactory, "downloadclient", ResourceMapper, BulkResourceMapper)
 *     {
 *         SharedValidator.RuleFor(c => c.Priority).InclusiveBetween(1, 50);
 *     }
 * }
 * ```
 *
 * ## Why this module builds its OWN `ProviderFactory`, not the real
 * `download-clients/DownloadClientFactory.ts`
 *
 * The real, already-ported `IDownloadClientFactory`/`DownloadClientFactory`
 * (download-clients/DownloadClientFactory.ts) is a hand-rolled, NARROW
 * factory predating `thingi-provider/` (same situation
 * `indexers/IndexerFactory.ts` documents for Indexers) -- it does not
 * implement the full `IProviderFactory<TProvider, TProviderConfig>` surface
 * `providerControllerBase()` requires (`all`/`get`/`getMany`/`create`/
 * `update`/`updateMany`/`delete`/`deleteMany`/`getDefaultDefinitions`/
 * `getPresetDefinitions`/`getInstance`/`requestAction`/`allForTag` -- see
 * `IProviderFactory.ts`). It is NOT modified here (out of this task's
 * scope; it's owned by the already-merged download-clients module).
 *
 * ## Two separate, narrower gaps than a full retrofit
 *
 * `DownloadClientDefinition`/`IDownloadClientRepository`
 * (download-clients/{DownloadClientDefinition,DownloadClientRepository}.ts)
 * genuinely ARE drop-in structurally compatible with
 * `ProviderDefinition<IProviderConfig>` / `IProviderRepository
 * <ProviderDefinition<IProviderConfig>>` -- every base field/method is
 * present with matching names/types (`DownloadClientDefinition` simply
 * carries FOUR extra fields -- `protocol`/`priority`/
 * `removeCompletedDownloads`/`removeFailedDownloads` -- on top of the base
 * shape, and a wider type structurally satisfies a narrower one). So
 * `repository` below is used completely UNTOUCHED, no adapter, and none of
 * `ProviderFactory`'s own methods (`all`/`get`/`create`/`update`/etc.)
 * reconstruct a NEW definition object that could drop those four extra
 * fields -- they pass the live object straight through to the repository.
 *
 * `IDownloadClient`, however, is genuinely NOT a drop-in `IProvider
 * <IProviderConfig>` -- verified directly (not assumed) via `tsc`: it's
 * missing `configContract`/`message`/`defaultDefinitions` entirely (neither
 * the interface nor `DownloadClientBase` declare them -- this port's
 * `IDownloadClient` never carried an `IProvider` supertype relationship the
 * way `INotification` now does post-Notifications, since download-clients
 * predates `thingi-provider/`; see `IDownloadClient.ts`'s own
 * "FORWARD-REFERENCE NARROWING" doc comment). `adaptDownloadClient()` below
 * is a small, real adapter closing exactly that gap (and only that gap) --
 * synthesizing the three missing `IProvider` members from data already on
 * the live `IDownloadClient`/its `definition` (`configContract` from
 * `definition.configContract`, `message` always `null` since no real
 * `IDownloadClient` implementation in this port ever sets one, and
 * `defaultDefinitions` as a single-entry array built from the client's own
 * default settings factory, matching how `ProviderFactory.
 * getDefaultDefinitions()` falls back when a provider's own
 * `defaultDefinitions` doesn't contain a null/self-named entry -- see that
 * method's doc comment).
 *
 * The remaining gap -- the base's own `enable` (which the generic
 * `providerResourceMapper().toModel()` hardcodes to `false`) plus
 * `DownloadClientResource`'s four extra sibling JSON fields -- is closed via
 * `providerControllerBase()`'s real `resourceMapper` extension seam:
 * `rest/ProviderResource.ts`'s `extraFieldsProviderResourceMapper()` wraps
 * the generic mapper and copies `DOWNLOAD_CLIENT_EXTRA_FIELDS`
 * (`DownloadClientResource.ts`) directly to/from identically-named
 * definition properties, matching the real C#
 * `DownloadClientResourceMapper` subclass override exactly (previously
 * closed via `resources/extraProviderFields.ts`'s HTTP-middleware-based
 * `wrapProviderRouterWithExtraFields()`, before this seam existed -- see
 * that module's git history).
 *
 * ## Settings-schema genericity
 *
 * `DownloadClientDefinition.settings` varies by concrete implementation
 * (QBittorrentSettings/SabnzbdSettings/TorrentBlackholeSettings/
 * UsenetBlackholeSettings), so this controller's `fieldDefs` is the UNION
 * schema built by `genericProviderFieldSchema.ts`'s `unionFieldDefs()` --
 * see that module's doc comment for the full "why a union, not 4 separate
 * controllers or reflection" rationale.
 */

/** Ported from `ProviderFactory.getDefaultDefinitions()`'s per-provider fallback (`createProviderDefinition({ name: "", configContract: provider.configContract, implementation: provider.name })`) -- see that method's own doc comment; narrowed here to this controller's `DownloadClientDefinition` shape, then widened via `toProviderDefinition()` below (which is where `implementationName`/`message` actually get synthesized). */
function defaultDefinitionFor(
  implementation: string,
  configContract: string,
  createSettings: () => IProviderConfig
): DownloadClientDefinition {
  return {
    id: 0,
    name: "",
    implementation,
    configContract,
    enable: false,
    tags: [],
    settings: createSettings(),
    protocol: 0,
    priority: 1,
    removeCompletedDownloads: true,
    removeFailedDownloads: true,
  };
}

/**
 * `DownloadClientDefinition` (download-clients/DownloadClientDefinition.ts)
 * is missing TWO fields plain `ProviderDefinition` requires --
 * `implementationName` and `message` -- neither of which the real C#
 * persists either (both are stamped in-memory by
 * `ProviderFactory.SetProviderCharacteristics()`/`setProviderCharacteristicsFor()`
 * from the live instance every time a definition is loaded, never
 * round-tripped through the DB column set -- see
 * `DownloadClientRepository.ts`'s own doc comment on `Protocol` for the
 * identical "in-memory only, not persisted" precedent this port already
 * established for that table). `toProviderDefinition`/
 * `toDownloadClientDefinition` synthesize/discard those two fields at the
 * repository boundary: `implementationName` defaults to the bare
 * `implementation` string (matching `ProviderFactory.getInstance()`'s own
 * `setProviderCharacteristicsFor` stamping it from `provider.name`, which
 * IS the implementation string for every registered download client here),
 * `message` defaults to `null` (no real `IDownloadClient` implementation in
 * this port ever sets one).
 */
function toProviderDefinition(
  definition: DownloadClientDefinition
): ProviderDefinition<IProviderConfig> {
  return {
    ...definition,
    implementationName: definition.implementation,
    message: null,
  };
}

function toDownloadClientDefinition(
  definition: ProviderDefinition<IProviderConfig>
): DownloadClientDefinition {
  const { implementationName: _implementationName, message: _message, ...rest } = definition;
  return rest as DownloadClientDefinition;
}

/** Wraps the real, unmodified `IDownloadClientRepository` as an `IProviderRepository<ProviderDefinition<IProviderConfig>>` -- see `toProviderDefinition`/`toDownloadClientDefinition` doc comment for the two synthesized/discarded fields. Every other field (including the four DownloadClient-specific ones -- `protocol`/`priority`/`removeCompletedDownloads`/`removeFailedDownloads`) passes straight through untouched. */
function adaptDownloadClientRepository(
  repository: IDownloadClientRepository
): IProviderRepository<ProviderDefinition<IProviderConfig>> {
  return {
    all: () => repository.all().map(toProviderDefinition),
    find: (id) => {
      const found = repository.find(id);
      return found ? toProviderDefinition(found) : undefined;
    },
    get: (id) => toProviderDefinition(repository.get(id)),
    getMany: (ids) => repository.getMany(ids).map(toProviderDefinition),
    insert: (model) => toProviderDefinition(repository.insert(toDownloadClientDefinition(model))),
    update: (model) => toProviderDefinition(repository.update(toDownloadClientDefinition(model))),
    updateMany: (models) => {
      for (const model of models) {
        repository.update(toDownloadClientDefinition(model));
      }
    },
    upsert: (model) => toProviderDefinition(repository.upsert(toDownloadClientDefinition(model))),
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

/**
 * Adapts a real `IDownloadClient` to `IProvider<IProviderConfig>` -- see
 * module doc comment's "Two separate, narrower gaps" section for exactly
 * which three members are synthesized and why. Wraps rather than mutates;
 * every method call delegates straight to the underlying client.
 */
function adaptDownloadClient(
  client: IDownloadClient,
  configContract: string,
  createDefaultSettings: () => IProviderConfig
): IProvider<IProviderConfig> & { readonly raw: IDownloadClient } {
  return {
    get name(): string {
      return client.name;
    },
    get configContract(): string {
      return client.definition?.configContract ?? configContract;
    },
    get message(): ProviderMessage | null {
      return null;
    },
    get defaultDefinitions(): ProviderDefinition<IProviderConfig>[] {
      return [
        toProviderDefinition(
          defaultDefinitionFor(client.name, configContract, createDefaultSettings)
        ),
      ];
    },
    get definition(): ProviderDefinition<IProviderConfig> {
      return toProviderDefinition(client.definition);
    },
    set definition(value: ProviderDefinition<IProviderConfig>) {
      client.definition = toDownloadClientDefinition(value);
    },
    test: () => client.test(),
    requestAction: (action, query) => client.requestAction(action, query),
    raw: client,
  };
}

export interface DownloadClientControllerOptions {
  repository: IDownloadClientRepository;
  /** Live, fully-constructed download-client instances (this port's real QBittorrent/Sabnzbd/TorrentBlackhole/UsenetBlackhole -- see download-clients/index.ts). */
  providers: IDownloadClient[];
  eventAggregator?: ProviderFactoryEventAggregator;
  logger?: ProviderFactoryLogger;
}

/**
 * Ported from `SharedValidator.RuleFor(c => c.Priority).InclusiveBetween(1, 50)`.
 *
 * Reads `resource.priority` directly -- now that `DownloadClientController`
 * supplies `providerControllerBase()`'s real `resourceMapper` seam
 * (`rest/ProviderResource.ts`'s `extraFieldsProviderResourceMapper()`),
 * `priority` is a genuine top-level `DownloadClientResource` field on the
 * wire body `validateResource()` validates, same as the real C#
 * `SharedValidator.RuleFor(c => c.Priority)` reads it directly off
 * `DownloadClientResource.Priority` -- no `$$`-prefixed `fields[]` detour
 * needed anymore (that was only ever needed by the OLD
 * `wrapProviderRouterWithExtraFields()` middleware's hoisting scheme -- see
 * this file's git history for the pre-repoint version).
 */
const priorityValidator: ResourceValidator<ProviderResource> = (resource) => {
  const priority = (resource as DownloadClientResource).priority;
  if (typeof priority === "number" && (priority < 1 || priority > 50)) {
    return [
      {
        propertyName: "priority",
        errorMessage: `'Priority' must be between 1 and 50. You entered ${String(priority)}`,
      },
    ];
  }
  return [];
};

/** Every out-of-the-box implementation this port ships -- see download-clients/index.ts's own "OUT OF SCOPE" list for the clients NOT ported. Used to derive `configContract`/default-settings for the union field schema and each adapted provider's `defaultDefinitions`. */
const KNOWN_IMPLEMENTATIONS: {
  implementation: string;
  configContract: string;
  createSettings: () => IProviderConfig;
}[] = [
  {
    implementation: "qBittorrent",
    configContract: "QBittorrentSettings",
    createSettings: () => createQBittorrentSettings(),
  },
  {
    implementation: "SABnzbd",
    configContract: "SabnzbdSettings",
    createSettings: () => createSabnzbdSettings(),
  },
  {
    implementation: "Torrent Blackhole",
    configContract: "TorrentBlackholeSettings",
    createSettings: () => createTorrentBlackholeSettings(),
  },
  {
    implementation: "Usenet Blackhole",
    configContract: "UsenetBlackholeSettings",
    createSettings: () => createUsenetBlackholeSettings(),
  },
];

export function downloadClientController(options: DownloadClientControllerOptions): Router {
  const { repository, providers } = options;

  const implementationFactories = new Map<string, () => IProvider<IProviderConfig>>();
  const adaptedProviders: IProvider<IProviderConfig>[] = [];

  for (const client of providers) {
    const known = KNOWN_IMPLEMENTATIONS.find(
      (k) => k.implementation.toLowerCase() === client.name.toLowerCase()
    );
    const adapted = adaptDownloadClient(
      client,
      known?.configContract ?? client.definition?.configContract ?? client.name,
      known?.createSettings ?? (() => client.definition?.settings ?? createQBittorrentSettings())
    );
    implementationFactories.set(client.name.toLowerCase(), () => adapted);
    adaptedProviders.push(adapted);
  }

  const factory = new ProviderFactory<IProvider<IProviderConfig>, IProviderConfig>(
    adaptDownloadClientRepository(repository),
    adaptedProviders,
    implementationFactories,
    options.eventAggregator,
    options.logger
  );

  const fieldDefs = unionFieldDefs<IProviderConfig>(
    KNOWN_IMPLEMENTATIONS.map((k) => k.createSettings())
  );

  const settingsSchema: ProviderSettingsSchema<IProviderConfig> = {
    fieldDefs,
    createDefaultSettings: () => createQBittorrentSettings(),
  };

  return providerControllerBase<
    IProvider<IProviderConfig>,
    IProviderConfig,
    DownloadClientResource,
    ProviderDefinition<IProviderConfig>
  >({
    providerFactory: factory,
    settingsSchema,
    extraSharedValidator: priorityValidator,
    resourceMapper: extraFieldsProviderResourceMapper(settingsSchema, DOWNLOAD_CLIENT_EXTRA_FIELDS),
    updateBulkModel: (resource, existingDefinitions) =>
      applyDownloadClientBulkUpdate(
        resource,
        existingDefinitions as unknown as {
          enable: boolean;
          priority: number;
          removeCompletedDownloads: boolean;
          removeFailedDownloads: boolean;
        }[]
      ) as unknown as ProviderDefinition<IProviderConfig>[],
  });
}
