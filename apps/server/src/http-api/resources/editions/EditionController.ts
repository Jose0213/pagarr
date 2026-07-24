import { Router } from "express";
import type { EditionService } from "../../../books/editionService.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { editionsToResource } from "../books/EditionResource.js";

/**
 * Ported from NzbDrone.Api.V1.Editions/EditionController.cs.
 *
 * Note the real C# source's own namespace is `NzbDrone.Api.V1.Editions`
 * (not `Readarr.Api.V1.Editions` like every sibling controller group --
 * confirmed by reading the file directly, a genuine inconsistency in the
 * real shipped source, not a typo introduced by this port). `[V1ApiController]`
 * with no explicit resource name still derives the mount path from the
 * class name the same way every other bare `[V1ApiController]` controller
 * does -- `EditionController` -> `/api/v1/edition`.
 *
 * Plain Express `Router` (bare `Controller` in the real C# source, not
 * `RestController<TResource>`) -- a single `GET /` endpoint.
 */
export interface EditionControllerDeps {
  editionService: Pick<EditionService, "getEditionsByBook">;
}

export function editionController(deps: EditionControllerDeps): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const bookIds = parseIntArrayQuery(req.query["bookId"]);
    const editions = deps.editionService.getEditionsByBook(bookIds);
    res.json(editionsToResource(editions).map(stripDefaultId));
  });

  return router;
}

/** Ported from `[FromQuery]List<int> bookId` binding -- see books/BookController.ts's identical `parseIntArrayQuery` helper for the shared rationale (repeated-key vs single-value query normalization). Duplicated locally rather than imported to keep this controller's only real dependency on `books/EditionResource.ts`, matching this port's per-module dependency-minimization convention elsewhere (e.g. textMatching.ts). */
function parseIntArrayQuery(value: unknown): number[] {
  if (value === undefined) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));
}
