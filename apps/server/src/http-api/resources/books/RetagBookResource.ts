import type { RetagBookFilePreview } from "../../../media-files-tags/retagBookFilePreview.js";
import type { RestResource } from "../../rest/RestResource.js";

/** Ported from Readarr.Api.V1.Books/RetagBookResource.cs's `TagDifference` (nested class). */
export interface TagDifference {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

/** Ported from Readarr.Api.V1.Books/RetagBookResource.cs. */
export interface RetagBookResource extends RestResource {
  authorId: number;
  bookId: number;
  trackNumbers: number[];
  bookFileId: number;
  path: string;
  changes: TagDifference[];
}

/** Ported from RetagTrackResourceMapper.ToResource(RetagBookFilePreview model). Note the real C# mapper never assigns `Id` (always the RestResource default, 0), preserved as-is. */
export function retagBookPreviewToResource(
  model: RetagBookFilePreview | null | undefined
): RetagBookResource | null {
  if (!model) {
    return null;
  }

  return {
    id: 0,
    authorId: model.authorId,
    bookId: model.bookId,
    trackNumbers: [...model.trackNumbers],
    bookFileId: model.bookFileId,
    path: model.path,
    changes: Object.entries(model.changes).map(([field, [oldValue, newValue]]) => ({
      field,
      oldValue,
      newValue,
    })),
  };
}

export function retagBookPreviewsToResource(
  models: Iterable<RetagBookFilePreview>
): RetagBookResource[] {
  const result: RetagBookResource[] = [];
  for (const model of models) {
    const resource = retagBookPreviewToResource(model);
    if (resource) {
      result.push(resource);
    }
  }
  return result;
}
