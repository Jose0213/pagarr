/**
 * Ported from NzbDrone.Core/IndexerSearch/Definitions/*.cs
 * (SearchCriteriaBase.cs, AuthorSearchCriteria.cs, BookSearchCriteria.cs).
 *
 * ## Deviations from the C# source (mechanical, not behavioral)
 *
 * - `SearchCriteriaBase` was an `abstract class` with `virtual` properties
 *   (never actually overridden anywhere in the real tree) and two
 *   subclasses. Ported here as a plain `interface` + two `interface`
 *   extensions, matching this repo's established "TS interfaces for C#
 *   data-shape classes" convention (see books/models.ts's module doc
 *   comment). `AuthorQuery`/`BookQuery`/`ToString()` were C# computed
 *   properties/overrides with no settable backing field -- ported as plain
 *   functions (`authorQuery()`, `bookQuery()`, `describeCriteria()`) that
 *   take the criteria object, since TS interfaces carry no behavior.
 *
 * - `RemoveAccent()` (NzbDrone.Common.Extensions.StringExtensions) is a
 *   small, self-contained Unicode-normalization utility with no further
 *   dependencies of its own (unlike CleanAuthorName/FuzzyMatch, which are
 *   nontrivial Parser-module algorithms deliberately forward-referenced via
 *   ITextMatcher elsewhere in this repo -- see books/textMatching.ts). It's
 *   reimplemented directly here via JS's native `String.prototype.normalize`
 *   rather than forward-referenced, since porting it faithfully is a
 *   one-line translation, not a stand-in.
 *
 * - `NonWord`'s `\w` (`new Regex(@"[^\w`'’]", ...)`) is .NET's *Unicode-aware*
 *   `\w` by default (no `RegexOptions.ECMAScript`) -- it matches accented
 *   letters like `ö`/`ü` as word characters, leaving them untouched at this
 *   step; `RemoveAccent()` (called afterward) is what actually strips them
 *   down to `o`/`u`. JavaScript's `\w` is ASCII-only ([A-Za-z0-9_]), so a
 *   literal `/[^\w`'’]/` would incorrectly treat `ö`/`ü` as non-word and
 *   replace them with `+` before RemoveAccent ever runs -- silently
 *   changing "Mötley Crüe" from "Motley+Crue" to "M+tley+Cr+e". `NON_WORD`
 *   below uses `\p{L}\p{N}` (Unicode letter/number categories) plus `_` in
 *   place of `\w`, matching .NET's actual Unicode word-char semantics.
 *
 * - `SplitBookTitle` (NzbDrone.Core.Parser.Parser) *is* forward-referenced
 *   (see ../books/textMatching.ts's `ITextMatcher.splitBookTitle` -- the
 *   exact same seam Books already uses for this dependency). `bookQuery()`
 *   below takes an `ITextMatcher` parameter instead of importing the
 *   Parser module directly, for the same reason BookService.ts does.
 */

import type { Author, Book } from "../books/models.js";
import type { ITextMatcher } from "../books/textMatching.js";

// See this module's doc comment for why this isn't a literal `[^\w`'’]`.
const NON_WORD = /[^\p{L}\p{N}_`'’]/gu;
const BEGINNING_THE = /^the\s/i;
const REPEATING_PLUS = /\+{2,}/g;
// Unicode combining marks (Mn = "Nonspacing_Mark" general category), the
// same category C#'s CharUnicodeInfo.GetUnicodeCategory checks against
// UnicodeCategory.NonSpacingMark. The `\p{Mn}` Unicode property escape
// (requires the `u` flag) targets exactly that category.
const COMBINING_MARKS = /\p{Mn}/gu;

/** Ported from NzbDrone.Common.Extensions.StringExtensions.RemoveAccent(this string text). */
export function removeAccent(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").normalize("NFC");
}

/**
 * Ported from SearchCriteriaBase.GetQueryTitle(string title): normalizes a
 * title/name for use in an indexer query string.
 */
export function getQueryTitle(title: string): string {
  if (title === undefined || title === null || title.trim() === "") {
    throw new Error("title must not be null or whitespace");
  }

  // Most VA books are listed as VA, not Various Authors
  // TODO: Needed in Readarr??
  if (title === "Various Authors") {
    title = "VA";
  }

  let cleanTitle = title.replace(BEGINNING_THE, "");

  cleanTitle = cleanTitle.replace(/ & /g, " ");
  cleanTitle = cleanTitle.replace(/\./g, " ");
  cleanTitle = cleanTitle.replace(NON_WORD, "+");

  // remove any repeating +s
  cleanTitle = cleanTitle.replace(REPEATING_PLUS, "+");
  cleanTitle = removeAccent(cleanTitle);
  cleanTitle = cleanTitle.replace(/^[+ ]+|[+ ]+$/g, "");

  return cleanTitle.length === 0 ? title : cleanTitle;
}

/**
 * Ported from IndexerSearch/Definitions/SearchCriteriaBase.cs. Shared shape
 * for AuthorSearchCriteria/BookSearchCriteria -- `dispatch()` in
 * releaseSearchService.ts operates on this common surface.
 */
export interface SearchCriteriaBase {
  monitoredBooksOnly: boolean;
  userInvokedSearch: boolean;
  interactiveSearch: boolean;

  author: Author;
  books: Book[];
}

/** Ported from SearchCriteriaBase.AuthorQuery => GetQueryTitle(Author.Name). */
export function authorQuery(criteria: SearchCriteriaBase): string {
  return getQueryTitle(authorName(criteria.author));
}

/**
 * `Author.Name` in C# was a compatibility getter proxying
 * `Metadata.Value.Name` (see books/models.ts's module doc comment on why
 * that property wasn't ported onto `Author` itself). Every criteria-level
 * helper here that needs the author's display name goes through this
 * instead of `author.metadata?.name` directly, so the "Name" concept stays
 * centralized in one place matching the C# property's role.
 */
function authorName(author: Author): string {
  return author.metadata?.name ?? "";
}

/** Ported from AuthorSearchCriteria : SearchCriteriaBase (marker subtype -- no additional fields). */
export type AuthorSearchCriteria = SearchCriteriaBase;

/** Ported from AuthorSearchCriteria.ToString(): `$"[{Author.Name}]"`. */
export function describeAuthorSearchCriteria(criteria: AuthorSearchCriteria): string {
  return `[${authorName(criteria.author)}]`;
}

/** Ported from IndexerSearch/Definitions/BookSearchCriteria.cs. */
export interface BookSearchCriteria extends SearchCriteriaBase {
  bookTitle: string;
  bookYear: number;
  bookIsbn?: string;
  disambiguation?: string;
}

/**
 * Ported from BookSearchCriteria.BookQuery =>
 * GetQueryTitle(BookTitle.SplitBookTitle(Author.Name).Item1).
 *
 * Deviation: takes an `ITextMatcher` for `splitBookTitle` -- see this
 * module's doc comment.
 */
export function bookQuery(criteria: BookSearchCriteria, textMatcher: ITextMatcher): string {
  const [titleWithoutSubtitle] = textMatcher.splitBookTitle(
    criteria.bookTitle,
    authorName(criteria.author)
  );
  return getQueryTitle(titleWithoutSubtitle);
}

/** Ported from BookSearchCriteria.ToString(): `$"[{Author.Name} - {BookTitle}]"`. */
export function describeBookSearchCriteria(criteria: BookSearchCriteria): string {
  return `[${authorName(criteria.author)} - ${criteria.bookTitle}]`;
}

/**
 * Ported from SearchCriteriaBase.ToString() call sites (both subclasses
 * override it; ReleaseSearchService's logging calls `criteriaBase` in a
 * string-interpolation context, which dispatches to whichever override is
 * actually in play). Since these are plain interfaces here with no runtime
 * type tag, callers that log a criteria object pick the right describe*
 * function themselves rather than relying on virtual dispatch -- this
 * helper exists for the one call site (releaseSearchService.ts's Dispatch)
 * that logs a criteria value without statically knowing which subtype it
 * is, distinguishing them by the presence of `bookTitle`.
 */
export function describeSearchCriteria(criteria: SearchCriteriaBase): string {
  return "bookTitle" in criteria
    ? describeBookSearchCriteria(criteria as BookSearchCriteria)
    : describeAuthorSearchCriteria(criteria);
}
