import { Router } from "express";
import type { MetadataTagService } from "../../../media-files-tags/metadataTagService.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { retagBookPreviewsToResource } from "./RetagBookResource.js";

/**
 * Ported from Readarr.Api.V1.Books/RetagBookController.cs.
 *
 * Mount path: `/api/v1/retag` (`[V1ApiController("retag")]`). Plain Express
 * `Router` (bare `Controller` in the real C# source) -- a single `GET /`
 * preview endpoint.
 */
export interface RetagBookControllerDeps {
  metadataTagService: Pick<
    MetadataTagService,
    "getRetagPreviewsByBook" | "getRetagPreviewsByAuthor"
  >;
}

export function retagBookController(deps: RetagBookControllerDeps): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const bookIdRaw = req.query["bookId"];
    const authorIdRaw = req.query["authorId"];

    const bookId =
      typeof bookIdRaw === "string" && bookIdRaw.trim() !== ""
        ? Number.parseInt(bookIdRaw, 10)
        : undefined;
    const authorId =
      typeof authorIdRaw === "string" && authorIdRaw.trim() !== ""
        ? Number.parseInt(authorIdRaw, 10)
        : undefined;

    if (bookId !== undefined && !Number.isNaN(bookId)) {
      const previews = deps.metadataTagService
        .getRetagPreviewsByBook(bookId)
        .filter((p) => Object.keys(p.changes).length > 0);
      res.json(retagBookPreviewsToResource(previews).map(stripDefaultId));
      return;
    }

    if (authorId !== undefined && !Number.isNaN(authorId)) {
      const previews = deps.metadataTagService
        .getRetagPreviewsByAuthor(authorId)
        .filter((p) => Object.keys(p.changes).length > 0);
      res.json(retagBookPreviewsToResource(previews).map(stripDefaultId));
      return;
    }

    throw new BadRequestException("One of authorId or bookId must be specified");
  });

  return router;
}
