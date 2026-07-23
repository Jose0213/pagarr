/**
 * Ported from NzbDrone.Core/IndexerSearch/Definitions/{SearchCriteriaBase,
 * BookSearchCriteria,AuthorSearchCriteria}.cs.
 *
 * FORWARD-REFERENCE NARROWING: the real `SearchCriteriaBase` carries a full
 * `Author` and `List<Book>` (Books module domain objects) and computes
 * `AuthorQuery`/`BookQuery` from `Author.Name`/`Book.Title` via
 * `GetQueryTitle()` + `SplitBookTitle()` (the latter lives in the
 * not-yet-ported `NzbDrone.Core.Parser` module). This Indexers-module port
 * only needs the *query strings* the Torznab/Newznab request generators
 * actually read (`AuthorQuery`, `BookQuery`, `BookIsbn`/`BookYear`), so
 * rather than pull in the full Books domain model + unported Parser title
 * splitting here, this module takes pre-computed query strings directly.
 * Whatever later phase wires up real searches (IndexerSearch service) is
 * responsible for constructing these from an `Author`/`Book` the same way
 * `SearchCriteriaBase`/`BookSearchCriteria.BookQuery` did in C# -- this
 * mirrors how Books/Profiles forward-referenced each other in Phase 1
 * (narrow to the minimal interface actually consumed, documented inline).
 *
 * `GetQueryTitle()` itself (title-cleaning: strip leading "the", swap
 * "Various Authors" -> "VA", collapse non-word runs to "+", etc.) IS ported
 * here as `getQueryTitle()` since it's simple, self-contained, and every
 * caller of these criteria types needs to have applied it to get a
 * `authorQuery`/`bookQuery` in the first place.
 */

const NON_WORD = /[^\w`'’]/gi;
const BEGINNING_THE = /^the\s/i;

/**
 * Ported from SearchCriteriaBase.GetQueryTitle(string title). C#'s
 * `RemoveAccent()` (NzbDrone.Common.Extensions.StringExtensions) strips
 * diacritics via Unicode NFKD decomposition + combining-mark removal;
 * mirrored here with the same normalize-and-strip approach.
 */
export function getQueryTitle(title: string): string {
  if (title == null || title.trim() === "") {
    throw new Error("title must not be null or whitespace");
  }

  // Most VA books are listed as VA, not Various Authors
  let cleanTitle = title === "Various Authors" ? "VA" : title;

  cleanTitle = BEGINNING_THE.exec(cleanTitle) ? cleanTitle.replace(BEGINNING_THE, "") : cleanTitle;
  cleanTitle = cleanTitle.replaceAll(" & ", " ");
  cleanTitle = cleanTitle.replaceAll(".", " ");
  cleanTitle = cleanTitle.replace(NON_WORD, "+");

  // remove any repeating +s
  cleanTitle = cleanTitle.replace(/\+{2,}/g, "+");
  cleanTitle = removeAccent(cleanTitle);
  cleanTitle = cleanTitle.replace(/^[+ ]+|[+ ]+$/g, "");

  return cleanTitle.length === 0 ? title : cleanTitle;
}

/** Ported from NzbDrone.Common.Extensions.StringExtensions.RemoveAccent(). */
function removeAccent(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Ported from SearchCriteriaBase's shared fields (MonitoredBooksOnly,
 * UserInvokedSearch, InteractiveSearch) -- the Author/Books/AuthorQuery
 * fields are narrowed per the module doc comment above.
 */
export interface SearchCriteriaBase {
  monitoredBooksOnly?: boolean;
  userInvokedSearch?: boolean;
  interactiveSearch?: boolean;
  /** Ported from SearchCriteriaBase.AuthorQuery => GetQueryTitle(Author.Name). */
  authorQuery: string;
}

/**
 * Ported from BookSearchCriteria. `bookQuery` is the pre-computed
 * equivalent of `BookQuery => GetQueryTitle(BookTitle.SplitBookTitle(...).Item1)`
 * -- see the forward-reference note above.
 */
export interface BookSearchCriteria extends SearchCriteriaBase {
  bookTitle: string;
  bookQuery: string;
  bookYear?: number;
  bookIsbn?: string;
  disambiguation?: string;
}

/** Ported from AuthorSearchCriteria (adds nothing beyond the base). */
export type AuthorSearchCriteria = SearchCriteriaBase;
