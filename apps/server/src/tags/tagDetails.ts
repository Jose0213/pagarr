import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Tags/TagDetails.cs.
 *
 * Extends the plain `Tag` shape with the ids of every other entity type
 * currently referencing this tag, so the API/UI can show "this tag is used
 * by N authors, M notifications, ..." and so `TagService.Delete` can refuse
 * to delete a tag that's still in use (see tagService.ts).
 */
export interface TagDetails extends ModelBase {
  label: string;
  authorIds: number[];
  notificationIds: number[];
  restrictionIds: number[];
  delayProfileIds: number[];
  importListIds: number[];
  indexerIds: number[];
  rootFolderIds: number[];
  downloadClientIds: number[];
}

/**
 * Ported from `TagDetails.InUse` (C# expression-bodied property):
 * `AuthorIds.Any() || NotificationIds.Any() || ... `. Kept as a free
 * function rather than a class getter since `TagDetails` here is a plain
 * interface (see model-base.ts's doc comment on why models are interfaces,
 * not classes, in this port).
 */
export function tagDetailsInUse(details: TagDetails): boolean {
  return (
    details.authorIds.length > 0 ||
    details.notificationIds.length > 0 ||
    details.restrictionIds.length > 0 ||
    details.delayProfileIds.length > 0 ||
    details.importListIds.length > 0 ||
    details.indexerIds.length > 0 ||
    details.rootFolderIds.length > 0 ||
    details.downloadClientIds.length > 0
  );
}
