import type { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { IProviderConfig } from "../../../thingi-provider/index.js";
import type { ProviderResource } from "../../rest/ProviderResource.js";
import {
  providerResourceMapper,
  type ProviderSettingsSchema,
} from "../../rest/ProviderResource.js";
import type { IndexerProviderDefinition } from "./IndexerAdapter.js";

/**
 * Ported from Readarr.Api.V1/Indexers/IndexerResource.cs's `IndexerResource`
 * + `IndexerResourceMapper`.
 *
 * `IndexerResource : ProviderResource<IndexerResource>` -- ported as a plain
 * interface extending this port's own `ProviderResource` (rest/ProviderResource.ts),
 * matching every other concrete provider-kind resource's shape in this
 * codebase.
 */
export interface IndexerResource extends ProviderResource {
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  supportsRss: boolean;
  supportsSearch: boolean;
  protocol: DownloadProtocol;
  priority: number;
  downloadClientId: number;
  presets?: IndexerResource[];
}

/**
 * Ported from `IndexerResourceMapper.ToResource`/`ToModel`. Wraps the
 * generic `providerResourceMapper()` (rest/ProviderResource.ts) and layers
 * the Indexer-specific fields on top, exactly mirroring how the real
 * `IndexerResourceMapper : ProviderResourceMapper<IndexerResource,
 * IndexerDefinition>` calls `base.ToResource(definition)`/
 * `base.ToModel(resource)` first, then sets its own extra fields.
 *
 * Operates on `IndexerAdapter.ts`'s `IndexerProviderDefinition` (a
 * `ProviderDefinition<IProviderConfig>` widened with the five Indexer-only
 * fields as real properties -- see that module's doc comment) rather than
 * the bare generic `ProviderDefinition`, since `SupportsRss`/
 * `SupportsSearch`/`Protocol`/`EnableRss`/`EnableAutomaticSearch`/
 * `EnableInteractiveSearch`/`Priority`/`DownloadClientId` all need a real
 * source to read from.
 */
export function indexerResourceMapper(
  settingsSchema: ProviderSettingsSchema<IProviderConfig>,
  characteristics: {
    supportsRss: (definition: IndexerProviderDefinition) => boolean;
    supportsSearch: (definition: IndexerProviderDefinition) => boolean;
    protocol: (definition: IndexerProviderDefinition) => DownloadProtocol;
  },
  wikiSlug = "readarr"
): {
  toResource: (definition: IndexerProviderDefinition) => IndexerResource;
  toModel: (resource: IndexerResource | null | undefined) => IndexerProviderDefinition;
} {
  const base = providerResourceMapper<IProviderConfig>(settingsSchema, wikiSlug);

  return {
    toResource(definition): IndexerResource {
      const resource = base.toResource(definition) as IndexerResource;

      resource.enableRss = definition.enableRss;
      resource.enableAutomaticSearch = definition.enableAutomaticSearch;
      resource.enableInteractiveSearch = definition.enableInteractiveSearch;
      resource.supportsRss = characteristics.supportsRss(definition);
      resource.supportsSearch = characteristics.supportsSearch(definition);
      resource.protocol = characteristics.protocol(definition);
      resource.priority = definition.priority;
      resource.downloadClientId = definition.downloadClientId;

      return resource;
    },

    toModel(resource): IndexerProviderDefinition {
      const base_ = base.toModel(resource);

      // Ported: `base.ToModel(resource)` then the extra field assignments
      // (`EnableRss`/`EnableAutomaticSearch`/`Priority`/`DownloadClientId`)
      // -- NOTE the real C# `IndexerResourceMapper.ToModel` does NOT set
      // `EnableInteractiveSearch` despite listing it as a resource field
      // (compare against `ToResource`, which DOES set it) -- re-verified
      // directly against the real source: `ToModel` sets EnableRss,
      // EnableAutomaticSearch, Priority, DownloadClientId, but never
      // EnableInteractiveSearch. This looks like a bug (the field is
      // silently dropped on create/update, always defaulting to
      // `ProviderDefinition`'s base `false`) but is preserved exactly per
      // this port's faithful-port mandate: `enableInteractiveSearch` below
      // is hardcoded `false`, NOT `resource?.enableInteractiveSearch`.
      return {
        ...base_,
        enableRss: resource?.enableRss ?? false,
        enableAutomaticSearch: resource?.enableAutomaticSearch ?? false,
        enableInteractiveSearch: false,
        priority: resource?.priority ?? 25,
        downloadClientId: resource?.downloadClientId ?? 0,
      };
    },
  };
}
