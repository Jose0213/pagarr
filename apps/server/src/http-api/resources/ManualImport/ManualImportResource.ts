import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { ParsedTrackInfo } from "../../../parser/model/parsedTrackInfo.js";
import type { Rejection } from "../../../decision-engine/rejection.js";
import type { ManualImportItem } from "../../../media-files-import/bookImport/manual/manualImportItem.js";
import type { RestResource } from "../../rest/RestResource.js";
import { authorToResource, type AuthorResource } from "../author/AuthorResource.js";
import { bookToResource, type BookResource } from "../books/BookResource.js";

/**
 * Ported from Readarr.Api.V1/ManualImport/ManualImportResource.cs.
 *
 * `Author`/`Book` embed the real `AuthorResource`/`BookResource` (see
 * `resources/author/AuthorResource.ts` / `resources/books/BookResource.ts`)
 * -- repointed during merge reconciliation from this worktree's original
 * narrow forward-ref stand-ins (`ManualImportAuthorResource`/
 * `ManualImportBookResource`, carrying only `id`/`authorName`/`titleSlug`
 * and `id`/`title`/`authorId` respectively -- all `ManualImportItem`'s
 * source data had available without a full AuthorService/BookService
 * statistics/image pipeline behind it) once the sibling `api-books-editions`
 * group that owns those resources landed. The real mappers are null-safe
 * the same way the old stand-ins were (`author`/`book` on a
 * `ManualImportItem` are genuinely optional -- a file that hasn't been
 * matched to anything yet).
 */
export interface ManualImportResource extends RestResource {
  path: string;
  name: string;
  size: number;
  author: AuthorResource | null;
  book: BookResource | null;
  foreignEditionId?: string;
  quality?: QualityModel;
  releaseGroup: string | null;
  qualityWeight: number;
  downloadId: string | null;
  indexerFlags: number;
  rejections: readonly Rejection[];
  audioTags?: ParsedTrackInfo;
  additionalFile: boolean;
  replaceExistingFiles: boolean;
  disableReleaseSwitching: boolean;
}

/** Ported from `ManualImportResourceMapper.ToResource(this ManualImportItem model)`. */
export function manualImportItemToResource(
  model: ManualImportItem | null | undefined
): ManualImportResource | null {
  if (model === null || model === undefined) {
    return null;
  }

  const foreignEditionId =
    model.edition?.foreignEditionId ??
    model.book?.editions?.find((e) => e.monitored)?.foreignEditionId;

  const resource: ManualImportResource = {
    id: model.id,
    path: model.path,
    name: model.name,
    size: model.size,
    author: authorToResource(model.author),
    book: bookToResource(model.book),
    quality: model.quality,
    releaseGroup: model.releaseGroup,
    // QualityWeight -- filled in by the controller, matching the real
    // C# source's own comment ("//QualityWeight", left unset by the mapper
    // itself and populated afterward by `ManualImportController.AddQualityWeight`).
    qualityWeight: 0,
    downloadId: model.downloadId,
    indexerFlags: model.indexerFlags,
    rejections: model.rejections,
    audioTags: model.tags,
    additionalFile: model.additionalFile,
    replaceExistingFiles: model.replaceExistingFiles,
    disableReleaseSwitching: model.disableReleaseSwitching,
  };

  if (foreignEditionId !== undefined) {
    resource.foreignEditionId = foreignEditionId;
  }

  return resource;
}

/** Ported from `ManualImportResourceMapper.ToResource(this IEnumerable<ManualImportItem> models)`. */
export function manualImportItemsToResource(
  models: Iterable<ManualImportItem>
): ManualImportResource[] {
  return Array.from(models, (m) => manualImportItemToResource(m)!);
}
