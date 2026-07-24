import type { Author } from "../../../books/index.js";
import type { BookFile } from "../../../media-files-import/bookFile.js";
import type { IUpgradableSpecification } from "../../../decision-engine/specifications/upgradableSpecification.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import { Quality } from "../../../qualities/quality.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { ParsedTrackInfo } from "../../../parser/model/parsedTrackInfo.js";
import type { RestResource } from "../../rest/RestResource.js";
import { mediaInfoToResource, type MediaInfoResource } from "./MediaInfoResource.js";

/**
 * Ported from Readarr.Api.V1/BookFiles/BookFileResource.cs.
 *
 * `AuthorResource` isn't mapped here at all -- the real C# resource never
 * embeds one either (only `AuthorId: int`), so no forward-reference to
 * whatever sibling worktree eventually lands `Readarr.Api.V1/Author/` is
 * needed for this file specifically (contrast with `ManualImportResource.ts`
 * in this same task, which DOES embed a full `AuthorResource`/`BookResource`
 * and documents its own narrow local stand-ins for them).
 */
export interface BookFileResource extends RestResource {
  authorId: number;
  bookId: number;
  path: string;
  size: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  dateAdded: string;
  quality: QualityModel;
  qualityWeight: number;
  indexerFlags?: number;
  mediaInfo: MediaInfoResource | null;
  qualityCutoffNotMet: boolean;
  audioTags?: ParsedTrackInfo;
}

/** Ported from BookFileResourceMapper's private `QualityWeight(QualityModel quality)`. */
function qualityWeight(quality: QualityModel | null | undefined): number {
  if (!quality) {
    return 0;
  }

  const definition = Quality.DefaultQualityDefinitions.find(
    (d) => d.quality.id === quality.quality.id
  );
  if (!definition) {
    throw new Error("Sequence contains no matching element");
  }

  let weight = definition.weight;
  weight += quality.revision.real * 10;
  weight += quality.revision.version;
  return weight;
}

/** Ported from `BookFileResourceMapper.ToResource(this BookFile model)` (no author overload). */
export function bookFileToResource(model: BookFile | null | undefined): BookFileResource | null {
  if (model === null || model === undefined) {
    return null;
  }

  return {
    id: model.id,
    authorId: 0,
    bookId: model.edition?.bookId ?? 0,
    path: model.path,
    size: model.size,
    dateAdded: model.dateAdded,
    quality: model.quality,
    qualityWeight: qualityWeight(model.quality),
    mediaInfo: mediaInfoToResource(model.mediaInfo),
    qualityCutoffNotMet: false,
  };
}

/**
 * Ported from `BookFileResourceMapper.ToResource(this BookFile model,
 * Author author, IUpgradableSpecification upgradableSpecification)`.
 * `author.qualityProfile` is a C# `LazyLoaded<QualityProfile>` field this
 * port's `Author` doesn't carry directly -- narrowed via the
 * `qualityProfile` parameter, matching this codebase's established
 * caller-supplies-the-loaded-relation convention (see mediaCoverService.ts's
 * doc comment for the same LazyLoaded substitution elsewhere).
 */
export function bookFileToResourceWithAuthor(
  model: BookFile | null | undefined,
  author: Author,
  qualityProfile: QualityProfile,
  upgradableSpecification: Pick<IUpgradableSpecification, "qualityCutoffNotMet">
): BookFileResource | null {
  if (model === null || model === undefined) {
    return null;
  }

  return {
    id: model.id,
    authorId: author.id,
    bookId: model.edition?.bookId ?? 0,
    path: model.path,
    size: model.size,
    dateAdded: model.dateAdded,
    quality: model.quality,
    qualityWeight: qualityWeight(model.quality),
    mediaInfo: mediaInfoToResource(model.mediaInfo),
    qualityCutoffNotMet: upgradableSpecification.qualityCutoffNotMet(qualityProfile, model.quality),
    indexerFlags: model.indexerFlags,
  };
}
