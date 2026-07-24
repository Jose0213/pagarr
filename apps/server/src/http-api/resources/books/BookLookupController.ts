import { Router, type NextFunction, type Request, type Response } from "express";
import type { ISearchForNewBook } from "../../../metadata-source/interfaces.js";
import type { IMapCoversToLocal } from "../../../media-cover/mediaCoverService.js";
import { MediaCoverEntity, MediaCoverTypes } from "../../../media-cover/mediaCover.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { bookToResource } from "./BookResource.js";

/**
 * Ported from Readarr.Api.V1.Books/BookLookupController.cs.
 *
 * Mount path: `/api/v1/book/lookup` (`[V1ApiController("book/lookup")]`).
 * Plain Express `Router`, bare `Controller` in the real C# source (not
 * `RestController<TResource>`) -- a single `GET /` search-to-add endpoint.
 */
export interface BookLookupControllerDeps {
  searchProxy: Pick<ISearchForNewBook, "searchForNewBook">;
  coverMapper: Pick<IMapCoversToLocal, "convertToLocalUrls">;
}

export function bookLookupController(deps: BookLookupControllerDeps): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const term = typeof req.query["term"] === "string" ? req.query["term"] : "";

      const searchResults = await deps.searchProxy.searchForNewBook(term, null);

      const resources = searchResults.map((book) => {
        const resource = bookToResource(book)!;

        deps.coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Book, resource.images);

        const cover = resource.images.find(
          (c) => c.coverType === coverTypeName(MediaCoverTypes.Cover)
        );
        if (cover) {
          resource.remoteCover = cover.remoteUrl;
        }

        return resource;
      });

      res.json(resources.map(stripDefaultId));
    })
  );

  return router;
}

/** Same rationale as RestController.ts's own `asyncHandler`: Express 4 has no built-in async-route-rejection forwarding. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Ported from `coverType.ToString().ToLower()` -- matches media-cover/mediaCoverService.ts's own `coverTypeName` local helper, re-derived here to compare against `MediaCoverImage.coverType`'s stored-string shape without importing that module's private function. */
function coverTypeName(coverType: MediaCoverTypes): string {
  return MediaCoverTypes[coverType].toLowerCase();
}
