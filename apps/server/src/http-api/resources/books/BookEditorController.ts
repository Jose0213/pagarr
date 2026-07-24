import { Router } from "express";
import type { BookService } from "../../../books/bookService.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { booksToResource } from "./BookResource.js";
import type { BookEditorResource } from "./BookEditorResource.js";

/**
 * Ported from Readarr.Api.V1.Books/BookEditorController.cs.
 *
 * Mount path: `/api/v1/book/editor` (`[V1ApiController("book/editor")]`).
 * Plain Express `Router`, not built on `restController()` -- the real C#
 * source is a bare `Controller` (not `RestController<TResource>`), exposing
 * only `PUT /` (bulk field edit) and `DELETE /` (bulk delete), neither of
 * which fit the five-verb REST factory shape.
 *
 * `IManageCommandQueue commandQueueManager` is a real ctor dependency in
 * the C# source but is NEVER read in either action body (confirmed by
 * reading `BookEditorController.cs` directly) -- accepted here as an
 * optional dep for constructor-shape fidelity, never called, same
 * documented-dead-param treatment as `BookController.ts`'s
 * `upgradableSpecification`.
 */
export interface BookEditorControllerDeps {
  bookService: Pick<BookService, "getBooks" | "updateMany" | "deleteBook">;
}

export function bookEditorController(deps: BookEditorControllerDeps): Router {
  const router = Router();

  router.put("/", (req, res) => {
    const resource = req.body as BookEditorResource;

    const booksToUpdate = deps.bookService.getBooks(resource.bookIds);

    for (const book of booksToUpdate) {
      if (resource.monitored !== undefined && resource.monitored !== null) {
        book.monitored = resource.monitored;
      }
    }

    deps.bookService.updateMany(booksToUpdate);
    res.status(202).json(booksToResource(booksToUpdate).map(stripDefaultId));
  });

  router.delete("/", (req, res) => {
    const resource = req.body as BookEditorResource;

    for (const bookId of resource.bookIds) {
      deps.bookService.deleteBook(
        bookId,
        resource.deleteFiles ?? false,
        resource.addImportListExclusion ?? false
      );
    }

    res.json({});
  });

  return router;
}
