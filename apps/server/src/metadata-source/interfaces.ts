/**
 * Ported from NzbDrone.Core/MetadataSource/{IProvideAuthorInfo,IProvideBookInfo,
 * IProvideSeriesInfo,IProvideListInfo,ISearchForNewAuthor,ISearchForNewBook,
 * ISearchForNewEntity}.cs.
 *
 * ## Scoping note -- read this before extending this module
 *
 * Per `docs/known-issues-fixlist.md` #1, Readarr's real MetadataSource
 * implementations (`BookInfo/`, `Goodreads/`, `GoodreadsSearchProxy/`) are
 * NOT ported here. Those implementations all called one centralized
 * metadata server (bookinfo.club, itself a proxy in front of Goodreads).
 * When that single server rate-limited or went down, authors/books that
 * genuinely existed were reported as "not found" -- a structural
 * single-point-of-failure, not a matching bug, and the single
 * highest-severity finding from this project's pre-restart research
 * (Readarr #2783, #4107, #3486).
 *
 * What IS ported faithfully from the C# source:
 *  - This file: the five provider-facing interfaces + three search
 *    interfaces, unchanged in shape (method names, parameter order,
 *    optional-arg defaults, return shapes -- modulo TS's lack of
 *    C#'s Tuple<> and HashSet<>, see the per-interface comments below).
 *  - `dto.ts`: the response DTOs read from `BookInfo/BookInfoResource/*.cs`
 *    and `Goodreads/Resources/*.cs` -- these describe the *shape* of author/
 *    book/edition/series data that Books/models.ts's mapping functions
 *    expect to receive, which is still valid regardless of which upstream
 *    API produces it.
 *  - `MetadataRequestBuilder.cs`'s general "build an IHttpRequestBuilderFactory
 *    pointed at a configurable base URL" pattern, ported as
 *    `metadataRequestBuilder.ts` -- reused by all three providers instead of
 *    each hardcoding a base URL inline, though each provider's base URL is
 *    provider-specific (Hardcover/OpenLibrary/Google Books have different
 *    hosts), unlike the C# original where every implementation shared one
 *    configurable `MetadataSource` URL pointed at bookinfo.club.
 *
 * What is REPLACED, not ported:
 *  - `BookInfoProxy.cs`, `GoodreadsProxy.cs`, `GoodreadsSearchProxy.cs` and
 *    all of `Goodreads/Resources/*.cs`'s Goodreads-specific quirks (shelf
 *    scraping, `AuthorBookListResource`, `OwnedBookResource`, `ReviewResource`,
 *    `UserShelfResource` -- anything that exists only to talk to Goodreads
 *    as a user-facing site rather than describe book metadata) are dropped
 *    entirely. Three independent provider implementations satisfy the
 *    interfaces above instead: `hardcover/`, `open-library/`, `google-books/`.
 *  - `priorityMetadataService.ts` in this directory is the actual fix for
 *    known-issue #1: it implements the same five interfaces by trying
 *    providers in priority order and falling back on failure, so no single
 *    provider outage can produce a false "not found".
 */

import type { Author, AuthorMetadata, Book } from "../books/models.js";

/**
 * Ported from IProvideAuthorInfo.cs.
 *
 * C#: `Author GetAuthorInfo(string readarrId, bool useCache = true);`
 *     `HashSet<string> GetChangedAuthors(DateTime startTime);`
 *
 * `HashSet<string>` has no built-in TS equivalent with reference semantics
 * matching C#'s; `Set<string>` is the direct structural match. C# returns
 * `null` from `GetChangedAuthors` when the provider can't determine what
 * changed (see BookInfoProxy.GetChangedAuthors: `httpResponse.Resource ==
 * null || httpResponse.Resource.Limited`) -- ported as `Set<string> | null`
 * rather than an empty set, since "unknown" and "nothing changed" are
 * different results a caller (a future RefreshAuthorService) needs to
 * distinguish.
 */
export interface IProvideAuthorInfo {
  getAuthorInfo(foreignAuthorId: string, useCache?: boolean): Promise<Author>;
  getChangedAuthors(startTime: Date): Promise<Set<string> | null>;
}

/**
 * Ported from IProvideBookInfo.cs.
 *
 * C#: `Tuple<string, Book, List<AuthorMetadata>> GetBookInfo(string id);`
 *
 * The C# tuple is `(foreignAuthorId, book, authorMetadataCandidates)` --
 * see BookInfoProxy.PollBook's `Tuple.Create(authorId, book, metadata)`.
 * Ported as a plain named-field object; TS has no positional-tuple
 * ergonomics worth preserving here and a named shape is clearer at call
 * sites than `result[0]`/`result[1]`/`result[2]`.
 */
export interface BookInfoResult {
  foreignAuthorId: string;
  book: Book;
  authorMetadata: AuthorMetadata[];
}

export interface IProvideBookInfo {
  getBookInfo(foreignBookId: string): Promise<BookInfoResult>;
}

/**
 * Ported from IProvideSeriesInfo.cs.
 *
 * C#: `SeriesResource GetSeriesInfo(int id, bool useCache = true);` where
 * `SeriesResource` is `Goodreads/Resources/SeriesResource.cs` (the
 * Goodreads-specific DTO -- see dto.ts's `SeriesInfoResult` for the
 * provider-agnostic replacement shape, since we no longer have a single
 * "the" Goodreads series resource).
 *
 * C#'s `id` is `int` (a Goodreads series id specifically). Ported as
 * `string` since foreign ids here are provider-specific opaque strings
 * (Hardcover/OpenLibrary/Google Books ids are not all integers -- e.g.
 * OpenLibrary work keys are strings like "OL27448W").
 */
export interface IProvideSeriesInfo {
  getSeriesInfo(foreignSeriesId: string, useCache?: boolean): Promise<SeriesInfoResult>;
}

/**
 * Ported from IProvideListInfo.cs.
 *
 * C#: `ListResource GetListInfo(int id, int page, bool useCache = true);`
 * `ListResource` (`Goodreads/Resources/ListResource.cs`) modeled a
 * Goodreads user list/shelf -- a Goodreads-site-specific concept with no
 * equivalent on Hardcover/OpenLibrary/Google Books as "metadata for a
 * book". None of the three replacement providers expose an analogous
 * concept as part of basic book/author/series metadata (Hardcover has
 * user `lists`, but that's account data behind user auth, not public
 * metadata lookup -- out of scope for this interface). Kept as a shape-only
 * stub interface for fidelity with the C# surface; no provider in this
 * module implements it. A future contributor wiring up Hardcover's
 * authenticated `lists` search (see the Hardcover search guide's `List`
 * query_type) would implement this against that endpoint specifically.
 */
export interface IProvideListInfo {
  getListInfo(foreignListId: string, page: number, useCache?: boolean): Promise<ListInfoResult>;
}

/** Provider-agnostic replacement for Goodreads/Resources/SeriesResource.cs's shape -- see dto.ts. */
export interface SeriesInfoResult {
  foreignSeriesId: string;
  title: string;
  description: string | null;
  books: Array<{ foreignBookId: string; position: string | null }>;
}

/** Provider-agnostic placeholder shape for IProvideListInfo -- see its doc comment above. Not implemented by any provider in this module. */
export interface ListInfoResult {
  foreignListId: string;
  name: string;
  page: number;
  books: Array<{ foreignBookId: string }>;
}

/**
 * Ported from ISearchForNewAuthor.cs.
 * C#: `List<Author> SearchForNewAuthor(string title);`
 */
export interface ISearchForNewAuthor {
  searchForNewAuthor(title: string): Promise<Author[]>;
}

/**
 * Ported from ISearchForNewBook.cs.
 *
 * C#:
 *  `List<Book> SearchForNewBook(string title, string author, bool getAllEditions = true);`
 *  `List<Book> SearchByIsbn(string isbn);`
 *  `List<Book> SearchByAsin(string asin);`
 *  `List<Book> SearchByGoodreadsBookId(int goodreadsId, bool getAllEditions);`
 *
 * `SearchByGoodreadsBookId` is renamed `searchByForeignEditionId` -- the
 * method is provider-agnostic in shape (look up a single edition by the
 * provider's own numeric/opaque id) but the C# name bakes in "Goodreads",
 * which is exactly the coupling this module exists to remove. Same
 * parameter shape (id + getAllEditions) is preserved.
 */
export interface ISearchForNewBook {
  searchForNewBook(title: string, author: string | null, getAllEditions?: boolean): Promise<Book[]>;
  searchByIsbn(isbn: string): Promise<Book[]>;
  searchByAsin(asin: string): Promise<Book[]>;
  searchByForeignEditionId(foreignEditionId: string, getAllEditions: boolean): Promise<Book[]>;
}

/**
 * Ported from ISearchForNewEntity.cs.
 * C#: `List<object> SearchForNewEntity(string title);`
 *
 * C#'s `List<object>` is a heterogeneous mixed list of `Author` and `Book`
 * instances (see BookInfoProxy.SearchForNewEntity: it appends the author
 * once per book found, then the book itself -- callers `is`-check the
 * element type). Ported as a discriminated union array so TS callers get
 * exhaustive type narrowing instead of `unknown`/`object` casts.
 */
export type NewEntitySearchResult =
  { type: "author"; author: Author } | { type: "book"; book: Book };

export interface ISearchForNewEntity {
  searchForNewEntity(title: string): Promise<NewEntitySearchResult[]>;
}

/**
 * Combined surface a single provider client implements. Not present in the
 * C# source as one interface (BookInfoProxy implements the equivalent set
 * via multiple `: IFoo, IBar, ...` declarations) -- added here purely as a
 * TS convenience type for `priorityMetadataService.ts` and provider
 * constructors; it doesn't change any individual method's contract.
 */
export interface MetadataProvider
  extends
    IProvideAuthorInfo,
    IProvideBookInfo,
    ISearchForNewAuthor,
    ISearchForNewBook,
    ISearchForNewEntity {
  /** Stable identifier for logging/diagnostics and priority-chain ordering, e.g. "hardcover" | "open-library" | "google-books". */
  readonly name: string;
}
