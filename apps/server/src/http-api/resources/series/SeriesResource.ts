import type { Series } from "../../../books/models.js";
import type { RestResource } from "../../rest/RestResource.js";
import type { SeriesBookLinkResource } from "./SeriesBookLinkResource.js";
import { seriesBookLinksToResource } from "./SeriesBookLinkResource.js";

/** Ported from Readarr.Api.V1.Series/SeriesResource.cs. */
export interface SeriesResource extends RestResource {
  title: string;
  description: string | null;
  links: SeriesBookLinkResource[];
}

/**
 * Ported from SeriesResourceMapper.ToResource(NzbDrone.Core.Books.Series
 * model): the real C# mapper reads `model.LinkItems.Value` directly (a
 * lazy-loaded relation the real SqlBuilder-backed `SeriesRepository.
 * GetByAuthorId` query auto-populates via a join -- see this port's
 * `books/models.ts` module doc comment on why LazyLoaded relations are
 * dropped from the port's `Series` model itself and populated explicitly by
 * callers instead). `links` is therefore a required second parameter here
 * rather than read off `model` -- `SeriesController.ts` fetches it via
 * `SeriesBookLinkService.getLinksBySeries(model.id)` before calling this.
 */
export function seriesToResource(
  model: Series | null | undefined,
  links: SeriesBookLinkResource[]
): SeriesResource | null {
  if (!model) {
    return null;
  }

  return {
    id: model.id,
    title: model.title,
    description: model.description,
    links,
  };
}

export function seriesListToResource(
  models: Series[],
  linksBySeriesId: Map<number, SeriesBookLinkResource[]>
): SeriesResource[] {
  const result: SeriesResource[] = [];
  for (const model of models) {
    const resource = seriesToResource(model, linksBySeriesId.get(model.id) ?? []);
    if (resource) {
      result.push(resource);
    }
  }
  return result;
}

export { seriesBookLinksToResource };
