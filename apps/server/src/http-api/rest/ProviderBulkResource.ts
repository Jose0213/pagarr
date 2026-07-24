import type { IProviderConfig, ProviderDefinition } from "../../thingi-provider/index.js";
import { ApplyTags } from "./ApplyTags.js";

/**
 * Ported from Readarr.Api.V1/ProviderBulkResource.cs's
 * `ProviderBulkResource<T>` + `ProviderBulkResourceMapper`.
 *
 * `T` in the real C# generic is unused by the base `ProviderBulkResource<T>`
 * itself (no member of the base actually references `T`) -- it exists so a
 * concrete provider-kind's own bulk resource subclass
 * (`IndexerBulkResource : ProviderBulkResource<IndexerBulkResource>`) can
 * add extra bulk-editable fields (e.g. bulk-setting a shared `Tags`-like
 * field specific to that provider kind) while staying self-referential the
 * same way `ProviderResource<T>` is. This port drops the unused generic
 * parameter entirely -- there is nothing for it to parameterize on the base
 * shape, and TS has no use for a phantom type parameter here. A concrete
 * provider-kind module that needs extra bulk fields extends this interface
 * directly with its own additional properties (plain interface extension,
 * no generic needed).
 */
export interface ProviderBulkResource {
  ids: number[];
  tags?: number[];
  applyTags?: ApplyTags;
}

/** Ported from `ProviderBulkResource<T>`'s ctor: `Ids = new List<int>()`. */
export function createProviderBulkResource(
  overrides: Partial<ProviderBulkResource> = {}
): ProviderBulkResource {
  return { ids: [], ...overrides };
}

/**
 * Ported from `ProviderBulkResourceMapper.UpdateModel`: the base
 * implementation is a no-op pass-through (returns `existingDefinitions`
 * unchanged, or `[]` if `resource` is null) -- all the real bulk-tag
 * mutation happens in `ProviderControllerBase.UpdateProvider(bulk)` itself
 * (see ProviderControllerBase.ts), not in this mapper. Concrete
 * provider-kind modules that need extra bulk-field handling (mirroring a
 * hypothetical `IndexerBulkResourceMapper` override) supply their own
 * `updateModel` function with the same signature instead of this default.
 */
export function defaultUpdateBulkModel<TProviderConfig extends IProviderConfig>(
  resource: ProviderBulkResource | null | undefined,
  existingDefinitions: ProviderDefinition<TProviderConfig>[]
): ProviderDefinition<TProviderConfig>[] {
  if (!resource) {
    return [];
  }

  return existingDefinitions;
}

export { ApplyTags };
