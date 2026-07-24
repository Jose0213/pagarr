import type { NewItemMonitorTypes } from "../../../books/index.js";
import { ApplyTags } from "../../rest/ApplyTags.js";

/** Ported from Readarr.Api.V1/Author/AuthorEditorResource.cs. Request body for `PUT /api/v1/author/editor` (bulk edit) and `DELETE /api/v1/author/editor` (bulk delete, which only reads `authorIds` off this same shape -- see AuthorEditorController.ts). */
export interface AuthorEditorResource {
  authorIds: number[];
  monitored?: boolean | null;
  monitorNewItems?: NewItemMonitorTypes | null;
  qualityProfileId?: number | null;
  metadataProfileId?: number | null;
  rootFolderPath?: string | null;
  tags?: number[] | null;
  applyTags: ApplyTags;
  moveFiles: boolean;
  deleteFiles: boolean;
}
