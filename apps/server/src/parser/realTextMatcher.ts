import type { ITextMatcher } from "../books/index.js";
import {
  cleanAuthorName,
  removeAfterDash,
  removeBracketsAndContents,
  splitBookTitle,
} from "./parser.js";
import { fuzzyContains, fuzzyMatchScore } from "./stringMatching.js";

/**
 * Real `ITextMatcher` implementation (see `books/textMatching.ts`'s doc
 * comment for the full background on why that seam exists), backed by this
 * module's actual ported `Parser.CleanAuthorName`/`FuzzyMatch`/
 * `FuzzyContains`/`RemoveBracketsAndContents`/`RemoveAfterDash`/
 * `SplitBookTitle`. Construct this and pass it to `AuthorService`/
 * `BookService`/`EditionService` in place of `NullTextMatcher` to wire the
 * Books module's inexact-match search up to the real fuzzy-matching engine.
 *
 * `fuzzyMatch` here uses the simple two-argument Levenshtein-based
 * `StringExtensions.FuzzyMatch(this string a, string b)` (ported as
 * `fuzzyMatchScore` in stringMatching.ts) -- NOT the Bitap-based
 * `FuzzyContains.cs` overload `Parser.cs`'s own `GetTitleFuzzy` uses. This
 * matches AuthorService.cs/BookService.cs/EditionService.cs's actual C#
 * call sites (`a.FuzzyMatch(b)`, no `wordDelimiters` argument), which
 * resolve to the simple overload, not the Bitap one -- see
 * `parseBookTitleWithSearchCriteria`'s doc comment in parser.ts for the
 * one real call site that DOES use the Bitap overload.
 */
export class RealTextMatcher implements ITextMatcher {
  cleanAuthorName(name: string): string {
    return cleanAuthorName(name);
  }

  fuzzyMatch(a: string, b: string): number {
    return fuzzyMatchScore(a, b);
  }

  fuzzyContains(text: string, pattern: string): number {
    return fuzzyContains(text, pattern);
  }

  removeBracketsAndContents(text: string): string {
    return removeBracketsAndContents(text);
  }

  removeAfterDash(text: string): string {
    return removeAfterDash(text);
  }

  splitBookTitle(book: string, author: string): [string, string] {
    return splitBookTitle(book, author);
  }
}
