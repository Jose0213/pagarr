import type { ProviderBulkResource } from "../../rest/ProviderBulkResource.js";

/**
 * Ported from Readarr.Api.V1/DownloadClient/DownloadClientBulkResource.cs.
 *
 * `DownloadClientBulkResource : ProviderBulkResource<DownloadClientBulkResource>`
 * adds four NULLABLE (partial-update: "only touch if present") fields.
 * `DownloadClientBulkResourceMapper.UpdateModel` applies each one as
 * `resource.X ?? existing.X` -- ported below as `applyDownloadClientBulkUpdate`,
 * wired into `DownloadClientController.ts`'s `updateBulkModel` option (the
 * real per-controller override seam `providerControllerBase()` DOES expose
 * for bulk-field mapping -- see `ProviderControllerBase.ts`'s
 * `updateBulkModel` option and its doc comment).
 */
export interface DownloadClientBulkResource extends ProviderBulkResource {
  enable?: boolean;
  priority?: number;
  removeCompletedDownloads?: boolean;
  removeFailedDownloads?: boolean;
}

/**
 * Ported from `DownloadClientBulkResourceMapper.UpdateModel`: for each
 * existing definition, apply `resource.X ?? existing.X` per field --
 * matches the real C# `existing.Enable = resource.Enable ?? existing.Enable`
 * pattern exactly (a `null` bulk-resource returns an empty list, matching
 * `defaultUpdateBulkModel`'s own "resource null -> []" behavior).
 *
 * Mutates the four fields directly on the definition -- since
 * `DownloadClientController.ts` now supplies `providerControllerBase()`'s
 * real `resourceMapper` seam (`rest/ProviderResource.ts`'s
 * `extraFieldsProviderResourceMapper()`), `PUT /bulk`'s response mapper
 * (`mapper.toResource(definition)`) reads these fields directly off the
 * definition -- no detour through `settings`'s reserved `$$`-prefixed keys
 * needed anymore (that mirroring step existed only because the OLD
 * `wrapProviderRouterWithExtraFields()` middleware's response-side
 * unhoisting could only ever read from `settings`, never the definition
 * itself -- see this file's git history for the pre-repoint version).
 */
export function applyDownloadClientBulkUpdate<
  TDefinition extends {
    enable: boolean;
    priority: number;
    removeCompletedDownloads: boolean;
    removeFailedDownloads: boolean;
  },
>(
  resource: DownloadClientBulkResource | null | undefined,
  existingDefinitions: TDefinition[]
): TDefinition[] {
  if (!resource) {
    return [];
  }

  for (const existing of existingDefinitions) {
    existing.enable = resource.enable ?? existing.enable;
    existing.priority = resource.priority ?? existing.priority;
    existing.removeCompletedDownloads =
      resource.removeCompletedDownloads ?? existing.removeCompletedDownloads;
    existing.removeFailedDownloads =
      resource.removeFailedDownloads ?? existing.removeFailedDownloads;
  }

  return existingDefinitions;
}
