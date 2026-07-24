import type { RestResource } from "../../rest/RestResource.js";
import type { TagDetails } from "../../../tags/tagDetails.js";

/**
 * Ported from Readarr.Api.V1/Tags/TagDetailsResource.cs.
 *
 * NOTE on field-name fidelity vs the real C# resource: the real
 * `TagDetailsResource` has a `List<int> AuthorIds` slot mapped last in its
 * mapper (after `DownloadClientIds`). This port's already-ported
 * `tags/tagDetails.ts` `TagDetails` model (Phase 1) declares `authorIds`
 * where the real C# `TagDetails` model itself does too -- the ordering
 * below matches the real `TagDetailsResourceMapper.ToResource` field order
 * exactly (DelayProfileIds, ImportListIds, NotificationIds, RestrictionIds,
 * IndexerIds, DownloadClientIds, AuthorIds) even though this port's
 * `TagDetails` interface (see tagDetails.ts) declares `authorIds` earlier in
 * its own field list -- object literal field order has no runtime/wire
 * effect in either language, so this is purely a readability note, not a
 * behavior difference. `rootFolderIds` also exists on this port's
 * `TagDetails` (RootFolders is now ported, unlike when tagService.ts's doc
 * comment was written) but has NO slot on the real C# `TagDetailsResource`
 * -- Readarr's real resource genuinely omits root-folder usage from this
 * particular DTO (its `TagService.Details()` in the actual upstream source
 * predates a RootFolderIds field ever being added to the resource, even
 * though `TagDetails` itself and `TagController`'s sibling delete-guard
 * logic do track root-folder usage internally). Preserved faithfully: this
 * port's `TagDetailsResource` also has no `rootFolderIds` field, matching
 * the real wire shape exactly.
 */
export interface TagDetailsResource extends RestResource {
  label: string;
  delayProfileIds: number[];
  importListIds: number[];
  notificationIds: number[];
  restrictionIds: number[];
  indexerIds: number[];
  downloadClientIds: number[];
  authorIds: number[];
}

export const TAG_DETAILS_RESOURCE_NAME = "tagdetails";

/** Ported from `TagDetailsResourceMapper.ToResource(this TagDetails model)`. */
export function tagDetailsToResource(model: TagDetails): TagDetailsResource {
  return {
    id: model.id,
    label: model.label,
    delayProfileIds: model.delayProfileIds,
    importListIds: model.importListIds,
    notificationIds: model.notificationIds,
    restrictionIds: model.restrictionIds,
    indexerIds: model.indexerIds,
    downloadClientIds: model.downloadClientIds,
    authorIds: model.authorIds,
  };
}

/** Ported from `TagDetailsResourceMapper.ToResource(this IEnumerable<TagDetails> models)`. */
export function tagDetailsListToResource(models: TagDetails[]): TagDetailsResource[] {
  return models.map(tagDetailsToResource);
}
