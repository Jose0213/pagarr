import type { SeriesBookLink } from "../../../books/models.js";
import type { RestResource } from "../../rest/RestResource.js";

/** Ported from Readarr.Api.V1.Series/SeriesBookLinkResource.cs. */
export interface SeriesBookLinkResource extends RestResource {
  position: string | null;
  seriesPosition: number;
  seriesId: number;
  bookId: number;
}

/** Ported from SeriesBookLinkResourceMapper.ToResource(SeriesBookLink model). */
export function seriesBookLinkToResource(model: SeriesBookLink): SeriesBookLinkResource {
  return {
    id: model.id,
    position: model.position,
    seriesPosition: model.seriesPosition,
    seriesId: model.seriesId,
    bookId: model.bookId,
  };
}

export function seriesBookLinksToResource(
  models: Iterable<SeriesBookLink> | null | undefined
): SeriesBookLinkResource[] {
  if (!models) {
    return [];
  }
  return [...models].map(seriesBookLinkToResource);
}
