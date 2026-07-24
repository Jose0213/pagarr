import type { RestResource } from "../../rest/RestResource.js";
import { authorToResource, type AuthorResource } from "../author/AuthorResource.js";
import { bookToResource, booksToResource, type BookResource } from "../books/BookResource.js";
import { editionToResource, type EditionResource } from "../books/EditionResource.js";

/**
 * Ported from Readarr.Api.V1/Search/SearchResource.cs.
 *
 * ```csharp
 * public class SearchResource : RestResource
 * {
 *     public string ForeignId { get; set; }
 *     public AuthorResource Author { get; set; }
 *     public BookResource Book { get; set; }
 * }
 * ```
 *
 * `Author`/`Book` embed the real `AuthorResource`/`BookResource` (see
 * `resources/author/AuthorResource.ts` / `resources/books/BookResource.ts`)
 * -- repointed during merge reconciliation from this worktree's original
 * narrow forward-ref stand-ins (this file used to declare its own minimal
 * `AuthorResource`/`EditionResource`/`BookResource` interfaces + mapper
 * functions, narrowed to only the fields `SearchController.MapToResource`
 * actually sets, since neither sibling API group had landed yet -- both
 * have now landed). `SearchController.ts`'s `mapAuthor`/`mapBook` still own
 * the SAME post-mapping overrides the real C# `MapToResource` applies
 * (`RemotePoster`/`Folder` for Author; `Overview`/`Author`/`Editions`/
 * `RemoteCover` for Book) -- those are call-site logic, not resource-shape
 * concerns, so they stay in SearchController.ts and just operate on the
 * real resource types now instead of the old narrow ones.
 */
export interface SearchResource extends RestResource {
  foreignId: string;
  author?: AuthorResource | null;
  book?: BookResource | null;
}

export { authorToResource, bookToResource, booksToResource, editionToResource };
export type { AuthorResource, BookResource, EditionResource };
