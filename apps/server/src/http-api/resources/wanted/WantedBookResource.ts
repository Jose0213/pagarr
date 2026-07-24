import type { Book } from "../../../books/models.js";
import type { RestResource } from "../../rest/RestResource.js";
import { authorToResource, type AuthorResource } from "../author/AuthorResource.js";
import { toEmbeddedBookResource } from "../shared/embeddedResources.js";

/**
 * FORWARD-REFERENCE (partial): minimal book-list resource for
 * `Wanted/Cutoff` and `Wanted/Missing`'s `PagingResource<BookResource>`
 * response body.
 *
 * The real `CutoffController`/`MissingController : BookControllerWithSignalR`
 * -- `BookControllerWithSignalR.MapToResource(Book, bool includeAuthor)`
 * (Readarr.Api.V1/Books/BookControllerWithSignalR.cs) does far more than
 * embed an Author: it links `AuthorStatistics`/`SeriesBookLink`s and
 * rewrites cover-image URLs to local paths via `IMapCoversToLocal`. Now
 * that the real Books API group has landed (`resources/books/BookController.ts`),
 * that statistics/series-links/cover-mapping work is technically available
 * there, but it's implemented as `BookController.ts`-private helpers
 * (`mapBookToResource`/`mapBooksToResource`, not exported) requiring THREE
 * extra constructor dependencies (`seriesBookLinkService`,
 * `authorStatisticsService`, `coverMapper`) that `CutoffControllerOptions`/
 * `MissingControllerOptions` don't currently take. Wiring those through is
 * a genuine options-shape change to two controllers, not a same-shape
 * import swap -- left as a follow-up (same "documented, not silently
 * dropped" discipline as this port's other acknowledged gaps) rather than
 * done opportunistically mid-reconciliation-merge; this module still only
 * mirrors `EmbeddedBookResource`'s narrow field set for the `book` side of
 * the response.
 *
 * `author`, however, IS a pure type-level forward-ref with no extra
 * dependency needed to fix -- `AuthorResourceMapper.ToResource(Author)`
 * needs nothing `CutoffController`/`MissingController` don't already have
 * on hand (an `Author`), so it's repointed to the real
 * `resources/author/AuthorResource.ts`'s `authorToResource` here during
 * merge reconciliation, same as `queue/QueueResource.ts`'s identical author
 * repoint.
 */
export interface WantedBookResource extends RestResource {
  title: string;
  authorMetadataId: number;
  foreignBookId: string;
  monitored: boolean;
  anyEditionOk: boolean;
  releaseDate: string | null;
  genres: string[];
  ratings: Book["ratings"];
  cleanTitle: string;
  author?: AuthorResource | null;
}

export function toWantedBookResource(book: Book, includeAuthor: boolean): WantedBookResource {
  const embedded = toEmbeddedBookResource(book);

  return {
    id: embedded.id,
    title: embedded.title,
    authorMetadataId: embedded.authorMetadataId,
    foreignBookId: embedded.foreignBookId,
    monitored: embedded.monitored,
    anyEditionOk: embedded.anyEditionOk,
    releaseDate: embedded.releaseDate,
    genres: embedded.genres,
    ratings: embedded.ratings,
    cleanTitle: embedded.cleanTitle,
    author: includeAuthor && book.author ? authorToResource(book.author) : undefined,
  };
}
