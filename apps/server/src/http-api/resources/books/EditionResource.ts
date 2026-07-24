import type { Edition, Links, MediaCoverImage, Ratings } from "../../../books/models.js";
import { newEdition } from "../../../books/models.js";
import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1.Books/EditionResource.cs. Used directly by
 * `EditionController` (Editions/) and embedded on `BookResource.editions`
 * (Books/).
 */
export interface EditionResource extends RestResource {
  bookId: number;
  foreignEditionId: string;
  titleSlug: string;
  isbn13: string | null;
  asin: string | null;
  title: string;
  language: string | null;
  overview: string;
  format: string | null;
  isEbook: boolean;
  disambiguation: string | null;
  publisher: string | null;
  pageCount: number;
  releaseDate: string | null;
  images: MediaCoverImage[];
  links: Links[];
  ratings: Ratings;
  monitored: boolean;
  manualAdd: boolean;
  remoteCover?: string;
  /**
   * Ported from `EditionResource.Grabbed`'s `[JsonProperty(DefaultValueHandling
   * = DefaultValueHandling.Ignore)]` -- "hiding this so people don't think
   * it's usable (only used to set the initial state)". Not serialized when
   * false/unset -- see `stripGrabbedIfDefault` below, the same pattern
   * `stripDefaultId` (RestResource.ts) already established for `Id`.
   */
  grabbed?: boolean;
}

/** Ported from EditionResourceMapper.ToResource(Edition model). */
export function editionToResource(model: Edition | null | undefined): EditionResource | null {
  if (!model) {
    return null;
  }

  return {
    id: model.id,
    bookId: model.bookId,
    foreignEditionId: model.foreignEditionId,
    titleSlug: model.titleSlug,
    isbn13: model.isbn13,
    asin: model.asin,
    title: model.title,
    language: model.language,
    overview: model.overview,
    format: model.format,
    isEbook: model.isEbook,
    disambiguation: model.disambiguation,
    publisher: model.publisher,
    pageCount: model.pageCount,
    releaseDate: model.releaseDate,
    images: model.images,
    links: model.links,
    ratings: model.ratings,
    monitored: model.monitored,
    manualAdd: model.manualAdd,
  };
}

/** Ported from EditionResourceMapper.ToModel(EditionResource resource). */
export function editionResourceToModel(resource: EditionResource | null | undefined): Edition {
  if (!resource) {
    return newEdition();
  }

  return {
    id: resource.id,
    bookId: resource.bookId,
    foreignEditionId: resource.foreignEditionId,
    titleSlug: resource.titleSlug,
    isbn13: resource.isbn13,
    asin: resource.asin,
    title: resource.title,
    language: resource.language,
    overview: resource.overview,
    format: resource.format,
    isEbook: resource.isEbook,
    disambiguation: resource.disambiguation,
    publisher: resource.publisher,
    pageCount: resource.pageCount,
    releaseDate: resource.releaseDate,
    images: resource.images,
    links: resource.links,
    ratings: resource.ratings,
    monitored: resource.monitored,
    manualAdd: resource.manualAdd,
  };
}

export function editionsToResource(
  models: Iterable<Edition> | null | undefined
): EditionResource[] {
  if (!models) {
    return [];
  }
  const result: EditionResource[] = [];
  for (const model of models) {
    const resource = editionToResource(model);
    if (resource) {
      result.push(resource);
    }
  }
  return result;
}

export function editionResourcesToModel(resources: Iterable<EditionResource>): Edition[] {
  return [...resources].map((r) => editionResourceToModel(r));
}
