import type { BookResource } from "../books/BookResource.js";

/**
 * Ported from Readarr.Api.V1.Bookshelf/BookshelfAuthorResource.cs. Plain
 * request-body shape (not a RestResource) -- one entry of
 * `BookshelfResource.authors`, the "library" browse tree's per-author node.
 */
export interface BookshelfAuthorResource {
  id: number;
  monitored?: boolean | null;
  books?: BookResource[];
}
