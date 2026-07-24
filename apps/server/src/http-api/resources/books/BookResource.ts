import type {
  AddBookOptions,
  Book,
  Links,
  MediaCoverImage,
  Ratings,
} from "../../../books/models.js";
import { newAddBookOptions, newAuthor, newBook } from "../../../books/models.js";
import type { RestResource } from "../../rest/RestResource.js";
import type { AuthorResource } from "../author/AuthorResource.js";
import { authorResourceToModel, authorToResource } from "../author/AuthorResource.js";
import type { BookStatisticsResource } from "./BookStatisticsResource.js";
import type { EditionResource } from "./EditionResource.js";
import { editionResourcesToModel, editionsToResource } from "./EditionResource.js";

/**
 * Ported from Readarr.Api.V1.Books/BookResource.cs.
 *
 * `Grabbed`'s `[JsonIgnore(Condition = WhenWritingDefault)]`-equivalent
 * (`DefaultValueHandling.Ignore`, same effect for a `bool`: omit when
 * false) isn't reproduced as a serialization-time strip the way
 * `RestResource.ts`'s `stripDefaultId` strips `id === 0` -- `restController()`
 * only strips `id`, not arbitrary per-resource default-valued fields (see
 * that file's doc comment: only `RestResource.Id` carries the C# attribute
 * in the base class; every other "hide this field's default" attribute is
 * resource-specific). This resource's `grabbed` field is instead typed
 * optional and left `undefined` unless a caller (BookController's
 * `Handle(BookGrabbedEvent)` SignalR broadcast) explicitly sets it true --
 * `JSON.stringify` already omits `undefined` object properties, giving the
 * same "omitted unless meaningfully true" wire behavior without a bespoke
 * strip function.
 */
export interface BookResource extends RestResource {
  title: string;
  authorTitle: string;
  seriesTitle: string | null;
  disambiguation: string | null;
  overview: string | null;
  authorId: number;
  foreignBookId: string;
  foreignEditionId?: string;
  titleSlug: string;
  monitored: boolean;
  anyEditionOk: boolean;
  ratings: Ratings;
  releaseDate: string | null;
  pageCount: number;
  genres: string[];
  author?: AuthorResource | null;
  images: MediaCoverImage[];
  links: Links[];
  statistics?: BookStatisticsResource | null;
  added: string | null;
  addOptions?: AddBookOptions;
  remoteCover?: string;
  lastSearchTime: string | null;
  editions?: EditionResource[];
  /** See interface doc comment above on why this isn't wire-stripped the way `id` is. */
  grabbed?: boolean;
}

/**
 * Ported from `Book.SeriesLinks.Value.OrderBy(x => x.SeriesPosition)` +
 * `.Select(...).ConcatToString("; ")`: joins each link's series title
 * (optionally suffixed " #position" when `Position` is non-blank) with
 * "; ". `ConcatToString` on an empty/null sequence returns `null` in the
 * real C# extension (`NzbDrone.Common.Extensions.EnumerableExtensions`),
 * matching this function's `null` return for an empty/undefined
 * `seriesLinks`.
 */
function buildSeriesTitle(model: Book): string | null {
  const links = model.seriesLinks;
  if (!links || links.length === 0) {
    return null;
  }

  const ordered = [...links].sort((a, b) => a.seriesPosition - b.seriesPosition);
  const parts = ordered.map((link) => {
    const title = link.series?.title ?? "";
    const positionSuffix = link.position && link.position.trim() !== "" ? ` #${link.position}` : "";
    return title + positionSuffix;
  });

  return parts.join("; ");
}

/** Ported from BookResourceMapper.ToResource(Book model). */
export function bookToResource(model: Book | null | undefined): BookResource | null {
  if (!model) {
    return null;
  }

  const selectedEdition = (model.editions ?? []).find((e) => e.monitored);

  const title = selectedEdition?.title ?? model.title;
  const authorSortName = model.author?.metadata?.sortNameLastFirst ?? "";
  const authorTitle = `${authorSortName} ${title}`;

  const seriesTitle = buildSeriesTitle(model);

  return {
    id: model.id,
    authorId: model.author?.id ?? 0,
    foreignBookId: model.foreignBookId,
    foreignEditionId: (model.editions ?? []).find((e) => e.monitored)?.foreignEditionId,
    titleSlug: model.titleSlug,
    monitored: model.monitored,
    anyEditionOk: model.anyEditionOk,
    releaseDate: model.releaseDate,
    pageCount: selectedEdition?.pageCount ?? 0,
    genres: model.genres,
    title,
    authorTitle,
    seriesTitle,
    disambiguation: selectedEdition?.disambiguation ?? null,
    images: selectedEdition?.images ?? [],
    links: [...model.links, ...(selectedEdition?.links ?? [])],
    ratings: selectedEdition?.ratings ?? { votes: 0, value: 0 },
    added: model.added,
    lastSearchTime: model.lastSearchTime,
    // Ported real C# quirk: `BookResource.Overview` is a declared property
    // the wire schema carries, but `BookResourceMapper.ToResource` never
    // assigns it -- it's always the C# default (null) on every real
    // response. Preserved as-is per this port's "port the bug, documented"
    // rule rather than "fixed" to surface `model.Editions`' overview.
    overview: null,
  };
}

/** Ported from BookResourceMapper.ToModel(BookResource resource). */
export function bookResourceToModel(resource: BookResource | null | undefined): Book {
  if (!resource) {
    return newBook();
  }

  const author = resource.author
    ? (authorResourceToModel(resource.author) ?? newAuthorModel())
    : newAuthorModel();

  return {
    id: resource.id,
    authorMetadataId: 0,
    foreignBookId: resource.foreignBookId,
    foreignEditionId: resource.foreignEditionId,
    titleSlug: resource.titleSlug,
    title: resource.title,
    releaseDate: resource.releaseDate ?? null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "",
    monitored: resource.monitored,
    anyEditionOk: resource.anyEditionOk,
    lastInfoSync: null,
    added: null,
    addOptions: resource.addOptions ?? newAddBookOptions(),
    editions: resource.editions ? editionResourcesToModel(resource.editions) : [],
    author,
    authorMetadata: author.metadata,
  };
}

/**
 * Ported from `resource.Author?.ToModel() ?? new NzbDrone.Core.Books.Author()`
 * -- a freshly-constructed, all-default Author when the resource carries no
 * embedded author at all (or -- defensively, post-repoint-to-the-real
 * `author/AuthorResource.ts` -- when `authorResourceToModel` itself returns
 * `null`, which the books-group's own former forward-ref stand-in never did
 * but the real mapper does for a null/undefined input; the real C# never
 * reaches that branch here since it's always guarded by `resource.Author?.`,
 * so this fallback exists purely for type-safety, not a reachable path
 * change). Uses `books/models.ts`'s own `newAuthor()` factory directly
 * rather than routing through `authorResourceToModel(undefined)`, matching
 * `new NzbDrone.Core.Books.Author()` exactly (a bare default object, not a
 * resource-mapper round trip -- the real C# source never calls `ToModel()`
 * on a null resource here, it short-circuits via `?.` first).
 */
function newAuthorModel(): ReturnType<typeof newAuthor> {
  return newAuthor();
}

/**
 * Ported from `BookResourceMapper.ToModel(BookResource resource, Book book)`:
 * `resource.ToModel()` then `book.ApplyChanges(updatedBook); book.Editions =
 * updatedBook.Editions;` -- callers pass the freshly-fetched stored `Book`
 * as `existing`; only the fields `applyChangesBook` (books/models.ts) covers
 * are overwritten on it, plus `editions` is always replaced wholesale
 * (mirroring the extra explicit `book.Editions = updatedBook.Editions`
 * line the C# source has beyond its own `ApplyChanges` call).
 */
export function bookResourceToModelMerge(resource: BookResource, existing: Book): Book {
  const updated = bookResourceToModel(resource);

  return {
    ...existing,
    foreignBookId: updated.foreignBookId,
    foreignEditionId: updated.foreignEditionId,
    addOptions: updated.addOptions,
    monitored: updated.monitored,
    anyEditionOk: updated.anyEditionOk,
    editions: updated.editions,
  };
}

export function booksToResource(models: Iterable<Book> | null | undefined): BookResource[] {
  if (!models) {
    return [];
  }
  const result: BookResource[] = [];
  for (const model of models) {
    const resource = bookToResource(model);
    if (resource) {
      result.push(resource);
    }
  }
  return result;
}

/** Re-exported for controller call sites that only need embedded-resource mapping (author/editions), not the full Book<->BookResource round trip. */
export { authorToResource, editionsToResource };
