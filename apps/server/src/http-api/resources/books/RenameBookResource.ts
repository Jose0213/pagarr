import type { RenameBookFilePreview } from "../../../media-files-organize/renameBookFilePreview.js";
import type { RestResource } from "../../rest/RestResource.js";

/** Ported from Readarr.Api.V1.Books/RenameBookResource.cs. */
export interface RenameBookResource extends RestResource {
  authorId: number;
  bookId: number;
  bookFileId: number;
  existingPath: string;
  newPath: string;
}

/** Ported from RenameBookResourceMapper.ToResource(RenameBookFilePreview model). Note the real C# mapper never assigns `Id` (always the RestResource default, 0 -- stripped on the wire by `stripDefaultId`), preserved as-is. */
export function renameBookPreviewToResource(
  model: RenameBookFilePreview | null | undefined
): RenameBookResource | null {
  if (!model) {
    return null;
  }

  return {
    id: 0,
    authorId: model.authorId,
    bookId: model.bookId,
    bookFileId: model.bookFileId,
    existingPath: model.existingPath,
    newPath: model.newPath,
  };
}

export function renameBookPreviewsToResource(
  models: Iterable<RenameBookFilePreview>
): RenameBookResource[] {
  const result: RenameBookResource[] = [];
  for (const model of models) {
    const resource = renameBookPreviewToResource(model);
    if (resource) {
      result.push(resource);
    }
  }
  return result;
}
