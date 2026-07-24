import { Router } from "express";
import type { SeriesService } from "../../../books/seriesService.js";
import type { SeriesBookLinkService } from "../../../books/seriesBookLinkService.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { seriesBookLinksToResource, seriesListToResource } from "./SeriesResource.js";

/**
 * Ported from Readarr.Api.V1.Series/SeriesController.cs.
 *
 * Mount path: `/api/v1/series` (`[V1ApiController]`, class name -> "series").
 * Plain Express `Router` (bare `Controller` in the real C# source) -- a
 * single `GET /` endpoint.
 *
 * `_seriesService.GetByAuthorId(authorId).ToResource()` -- see
 * SeriesResource.ts's doc comment on why `getLinksBySeries` is called
 * explicitly per series here rather than relying on a lazy-loaded relation
 * the port's `Series` model doesn't carry.
 */
export interface SeriesControllerDeps {
  seriesService: Pick<SeriesService, "getByAuthorId">;
  seriesBookLinkService: Pick<SeriesBookLinkService, "getLinksBySeries">;
}

export function seriesController(deps: SeriesControllerDeps): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const authorId = parseIntQuery(req.query["authorId"]) ?? 0;

    const seriesList = deps.seriesService.getByAuthorId(authorId);

    const linksBySeriesId = new Map(
      seriesList.map((series) => [
        series.id,
        seriesBookLinksToResource(deps.seriesBookLinkService.getLinksBySeries(series.id)),
      ])
    );

    const resources = seriesListToResource(seriesList, linksBySeriesId);

    // Ported: `RestResource.Id`'s "omit when default (0)" JSON attribute
    // applies to both the outer SeriesResource and each nested
    // SeriesBookLinkResource -- stripped at the serialization boundary
    // (this controller isn't built on restController(), which is the only
    // place that stripping normally happens automatically -- see
    // rest/RestResource.ts's doc comment) rather than on the intermediate
    // typed values above, since `stripDefaultId`'s return type
    // (`Omit<T, "id"> | T`) would otherwise widen `linksBySeriesId`/
    // `resources` away from their real `SeriesResource[]`/
    // `SeriesBookLinkResource[]` shapes before this function is done using
    // them as such.
    res.json(
      resources.map((resource) => ({
        ...stripDefaultId(resource),
        links: resource.links.map(stripDefaultId),
      }))
    );
  });

  return router;
}

/** Ported from `[FromQuery]int authorId` binding: absent/non-numeric/non-string query values normalize to `undefined`. */
function parseIntQuery(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
