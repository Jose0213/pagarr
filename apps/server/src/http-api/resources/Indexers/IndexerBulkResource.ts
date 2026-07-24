import type { IProviderConfig, ProviderDefinition } from "../../../thingi-provider/index.js";
import type { ProviderBulkResource } from "../../rest/ProviderBulkResource.js";
import type { IndexerProviderDefinition } from "./IndexerAdapter.js";

/**
 * Ported from Readarr.Api.V1/Indexers/IndexerBulkResource.cs's
 * `IndexerBulkResource` + `IndexerBulkResourceMapper`.
 */
export interface IndexerBulkResource extends ProviderBulkResource {
  enableRss?: boolean | null;
  enableAutomaticSearch?: boolean | null;
  enableInteractiveSearch?: boolean | null;
  priority?: number | null;
}

/**
 * Ported from `IndexerBulkResourceMapper.UpdateModel(IndexerBulkResource
 * resource, List<IndexerDefinition> existingDefinitions)`: for each existing
 * definition, apply each bulk field only if the resource supplied a
 * non-null value (`resource.EnableRss ?? existing.EnableRss`), leaving the
 * definition unchanged otherwise. Passed as `providerControllerBase`'s
 * `updateBulkModel` option (see IndexerController.ts).
 *
 * `existingDefinitions` here are the `IndexerProviderDefinition`s
 * `providerControllerBase`'s `PUT /bulk` route fetched via
 * `providerFactory.getMany(ids)` -- since `IndexerAdapter.ts`'s
 * `ProviderRepositoryAdapter.getMany()` always returns real
 * `IndexerProviderDefinition`s (widened with the five Indexer-only fields,
 * see that module's doc comment), this function can read/write
 * `enableRss`/`enableAutomaticSearch`/`enableInteractiveSearch`/`priority`
 * directly on each object -- no side-channel lookup needed.
 */
export function indexerBulkUpdateModel(
  resource: IndexerBulkResource | null | undefined,
  existingDefinitions: ProviderDefinition<IProviderConfig>[]
): ProviderDefinition<IProviderConfig>[] {
  if (!resource) {
    return [];
  }

  for (const existing of existingDefinitions as IndexerProviderDefinition[]) {
    existing.enableRss = resource.enableRss ?? existing.enableRss;
    existing.enableAutomaticSearch =
      resource.enableAutomaticSearch ?? existing.enableAutomaticSearch;
    existing.enableInteractiveSearch =
      resource.enableInteractiveSearch ?? existing.enableInteractiveSearch;
    existing.priority = resource.priority ?? existing.priority;
  }

  return existingDefinitions;
}
