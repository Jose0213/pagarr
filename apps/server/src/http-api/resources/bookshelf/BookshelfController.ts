import { Router } from "express";
import type { AuthorService } from "../../../books/authorService.js";
import type { BookMonitoredService } from "../../../books/bookMonitoredService.js";
import { MonitorTypes } from "../../../books/models.js";
import type { BookshelfResource } from "./BookshelfResource.js";

/**
 * Ported from Readarr.Api.V1.Bookshelf/BookshelfController.cs.
 *
 * Mount path: `/api/v1/bookshelf` (`[V1ApiController]`, class name ->
 * "bookshelf" -- the real "library" browse view's bulk-monitoring-update
 * endpoint; despite the name this controller only WRITES monitoring state,
 * it doesn't itself serve the nested author->book browse tree read side --
 * that's `AuthorController`/`BookController`'s `GET` routes, outside this
 * file's real C# scope too). Plain Express `Router` (bare `Controller` in
 * the real C# source) -- a single `POST /` endpoint.
 */
export interface BookshelfControllerDeps {
  authorService: Pick<AuthorService, "getAuthors">;
  bookMonitoredService: Pick<BookMonitoredService, "setBookMonitoredStatus">;
}

export function bookshelfController(deps: BookshelfControllerDeps): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const request = req.body as BookshelfResource;

    const authorToUpdate = deps.authorService.getAuthors(request.authors.map((s) => s.id));
    const byId = new Map(authorToUpdate.map((a) => [a.id, a]));

    for (const s of request.authors) {
      const author = byId.get(s.id);
      if (!author) {
        throw new Error(`Sequence contains no matching element for author id ${s.id}`);
      }

      if (s.monitored !== undefined && s.monitored !== null) {
        author.monitored = s.monitored;
      }

      if (request.monitoringOptions && request.monitoringOptions.monitor === MonitorTypes.None) {
        author.monitored = false;
      }

      if (request.monitorNewItems !== undefined && request.monitorNewItems !== null) {
        author.monitorNewItems = request.monitorNewItems;
      }

      deps.bookMonitoredService.setBookMonitoredStatus(author, request.monitoringOptions ?? null);
    }

    res.status(202).json(request);
  });

  return router;
}
