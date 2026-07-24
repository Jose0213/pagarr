import type { RestResource } from "../../rest/RestResource.js";
import type { Author, Book, Edition, Links, Ratings } from "../../../books/models.js";

/**
 * Ported from the slice of Readarr.Api.V1/Books/BookResource.cs that
 * `CalendarController.GetCalendar` actually populates.
 *
 * FORWARD-REF -- scope boundary: the real `BookResource`/`BookResourceMapper`
 * (`Readarr.Api.V1/Books/BookResource.cs`) is the FULL Books API resource
 * -- `AuthorResource`, `EditionResource`, `BookStatisticsResource`,
 * `SeriesBookLinkService`-derived `SeriesTitle`, and
 * `IMapCoversToLocal`-rewritten cover URLs. None of those exist in this
 * repo yet: `Books/` is its own large API-resource group (per this task's
 * brief, ported by a different sibling agent working the same phase, with
 * "zero file overlap expected" against this Calendar group). Building the
 * REAL `BookResource` here would either duplicate that sibling's future
 * work or silently depend on files this worktree doesn't own.
 *
 * Per this task's brief ("Calendar sits on the real, already-ported
 * `apps/server/src/books/` module (Book release dates)"), this file ports
 * only the calendar-relevant subset of `BookResourceMapper.ToResource`
 * directly against the real, already-ported `books/` domain module
 * (`BookService`/`AuthorService`, Phase 1/3) -- the fields every consumer
 * of a calendar feed actually needs (title, release date, overview,
 * monitored, genres, author name) -- as its own self-contained
 * `CalendarBookResource`, NOT a reuse or re-declaration of the real
 * `BookResource` wire shape. When the real `Books/` API group lands in
 * this repo, `CalendarController`/`CalendarFeedController` below should be
 * revisited to delegate to its `BookControllerWithSignalR.MapToResource`
 * instead of this local subset -- tracked here, not silently left as the
 * permanent shape.
 *
 * Fields NOT ported here (all require modules this worktree doesn't own):
 * `authorTitle`/`seriesTitle` (SeriesBookLinkService), `statistics`
 * (AuthorStatisticsService), `images` (IMapCoversToLocal local URL
 * rewriting), `author` (the full nested `AuthorResource` -- a minimal
 * `{ id, name }` stand-in is used instead when `includeAuthor` is
 * requested, sourced directly from `AuthorService`/`AuthorMetadata`, not a
 * real `AuthorResource`).
 *
 * ## `selectedEdition` sourcing -- explicit bulk lookup, not `book.editions`
 *
 * The real C# `Book.Editions` is a Dapper `LazyLoaded<List<Edition>>`
 * that's actually populated by `BooksBetweenDates`'s underlying `Query()`
 * call (via `TableMapping`'s relationship-mapping join machinery -- not
 * something visible in the C# method body itself). This port's
 * `books/bookRepository.ts` `booksBetweenDates` (a raw `SELECT "Books".*`
 * query) does NOT populate `book.editions` -- per that module's own doc
 * comment, `editions` is an "optional lazy relation" only some methods
 * fill in, and `booksBetweenDates` isn't one of them. Calling code here
 * therefore does NOT read `book.editions` at all; instead, both
 * `CalendarController.ts`/`CalendarFeedController.ts` bulk-fetch every
 * monitored edition via `EditionService.getAllMonitoredEditions()` (the
 * SAME bulk-join pattern the real `BookController.GetBooks` action uses
 * for its own multi-book listing: `_editionService.GetAllMonitoredEditions()
 * .GroupBy(x => x.BookId)`) and pass the matching one in explicitly via
 * `bookToCalendarResource`'s `selectedEdition` parameter.
 */
export interface CalendarAuthorResource {
  id: number;
  authorName: string;
}

export interface CalendarBookResource extends RestResource {
  title: string;
  disambiguation: string | null;
  overview: string;
  authorId: number;
  foreignBookId: string;
  foreignEditionId: string | null;
  titleSlug: string;
  monitored: boolean;
  anyEditionOk: boolean;
  ratings: Ratings;
  releaseDate: string | null;
  pageCount: number;
  genres: string[];
  links: Links[];
  added: string | null;
  lastSearchTime: string | null;
  author?: CalendarAuthorResource;
}

export const CALENDAR_BOOK_RESOURCE_NAME = "book";

/**
 * Ported from the calendar-relevant subset of `BookResourceMapper.ToResource`
 * -- selects the single monitored edition (`model.Editions.Value.Where(x =>
 * x.Monitored).SingleOrDefault()`) for title/overview/disambiguation/
 * pageCount/ratings/foreignEditionId fallback, matching the real mapper's
 * `selectedEdition` local exactly.
 */
export function bookToCalendarResource(
  book: Book,
  selectedEdition: Edition | undefined,
  author: Author | undefined,
  includeAuthor: boolean
): CalendarBookResource {
  const resource: CalendarBookResource = {
    id: book.id,
    title: selectedEdition?.title ?? book.title,
    disambiguation: selectedEdition?.disambiguation ?? null,
    overview: selectedEdition?.overview ?? "",
    authorId: book.authorMetadataId,
    foreignBookId: book.foreignBookId,
    foreignEditionId: selectedEdition?.foreignEditionId ?? null,
    titleSlug: book.titleSlug,
    monitored: book.monitored,
    anyEditionOk: book.anyEditionOk,
    ratings: selectedEdition?.ratings ?? { votes: 0, value: 0 },
    releaseDate: book.releaseDate,
    pageCount: selectedEdition?.pageCount ?? 0,
    genres: book.genres,
    links: [...book.links, ...(selectedEdition?.links ?? [])],
    added: book.added,
    lastSearchTime: book.lastSearchTime,
  };

  if (includeAuthor && author) {
    resource.author = { id: author.id, authorName: author.metadata?.name ?? "" };
  }

  return resource;
}
