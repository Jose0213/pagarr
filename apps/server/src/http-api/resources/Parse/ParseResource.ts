import type { ParsedBookInfo } from "../../../parser/model/parsedBookInfo.js";
import type { RestResource } from "../../rest/RestResource.js";
import {
  authorToResource,
  bookToResource,
  booksToResource,
  type AuthorResource,
  type BookResource,
} from "../Search/SearchResource.js";

/**
 * Ported from Readarr.Api.V1/Parse/ParseResource.cs.
 *
 * ```csharp
 * public class ParseResource : RestResource
 * {
 *     public string Title { get; set; }
 *     public ParsedBookInfo ParsedBookInfo { get; set; }
 *     public AuthorResource Author { get; set; }
 *     public List<BookResource> Books { get; set; }
 * }
 * ```
 *
 * `AuthorResource`/`BookResource` are the real resources (re-exported via
 * `Search/SearchResource.ts`, which itself repoints to
 * `resources/author/AuthorResource.ts` / `resources/books/BookResource.ts`
 * -- see that file's doc comment for the repoint history). Both
 * `SearchController`/`ParseController` share the same import rather than
 * each declaring their own.
 */
export interface ParseResource extends RestResource {
  title: string;
  parsedBookInfo: ParsedBookInfo | null;
  author?: AuthorResource | null;
  books?: BookResource[];
}

export { authorToResource, bookToResource, booksToResource };
