import { Router } from "express";
import type { IRenameBookFileService } from "../../../media-files-organize/renameBookFileService.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { renameBookPreviewsToResource } from "./RenameBookResource.js";

/**
 * Ported from Readarr.Api.V1.Books/RenameBookController.cs.
 *
 * Mount path: `/api/v1/rename` (`[V1ApiController("rename")]`). Plain
 * Express `Router` (bare `Controller` in the real C# source) -- a single
 * `GET /` preview endpoint.
 */
export interface RenameBookControllerDeps {
  renameBookFileService: Pick<
    IRenameBookFileService,
    "getRenamePreviewsForAuthor" | "getRenamePreviewsForBook"
  >;
}

export function renameBookController(deps: RenameBookControllerDeps): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const authorId = parseIntQuery(req.query["authorId"]) ?? 0;
    const bookId = parseIntQuery(req.query["bookId"]);

    if (bookId !== undefined) {
      res.json(
        renameBookPreviewsToResource(
          deps.renameBookFileService.getRenamePreviewsForBook(authorId, bookId)
        ).map(stripDefaultId)
      );
      return;
    }

    res.json(
      renameBookPreviewsToResource(
        deps.renameBookFileService.getRenamePreviewsForAuthor(authorId)
      ).map(stripDefaultId)
    );
  });

  return router;
}

/** Ported from `[FromQuery]int authorId`/`int? bookId` binding: absent/non-numeric/non-string (e.g. a nested `?bookId[x]=1` query object) query values all normalize to `undefined`. */
function parseIntQuery(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
