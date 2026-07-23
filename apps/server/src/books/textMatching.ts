/**
 * Ported dependency-injection seam for NzbDrone.Core/Parser/Parser.cs's
 * string-cleaning/fuzzy-matching extension methods
 * (CleanAuthorName/FuzzyMatch/FuzzyContains/RemoveBracketsAndContents/
 * RemoveAfterDash/SplitBookTitle), as used by AuthorService.cs,
 * BookService.cs, and EditionService.cs's inexact-match search methods.
 *
 * ## Why this exists (deviation from the C# source)
 *
 * C# consumed these as static extension methods (`title.CleanAuthorName()`,
 * `a.FuzzyMatch(b)`) directly imported from `NzbDrone.Core.Parser` --
 * available to any class in the assembly with a `using` statement, no DI
 * needed. `Parser` is a large (Phase 2) module not yet ported in this
 * worktree (PORT_PLAN.md places it after Indexers/DecisionEngine
 * dependencies are sorted out, and its `FuzzyMatch`/`FuzzyContains`
 * implementations are a nontrivial Bitap approximate-string-matching
 * algorithm -- not something to silently reimplement as a side-effect of
 * porting Books).
 *
 * Rather than block the entire Books module on Parser, or silently drop
 * the inexact-match search behavior these services expose
 * (`FindByNameInexact`, `GetCandidates`, `FindByTitleInexact`, etc.), this
 * module defines the narrow `ITextMatcher` contract those methods actually
 * need and takes it as a constructor dependency, exactly per PORT_PLAN.md's
 * "plain constructor injection" DI replacement. When the Parser module is
 * ported, a real implementation of this interface backed by the real
 * `CleanAuthorName`/`FuzzyMatch`/etc. can be constructed and passed in --
 * no call site in authorService.ts/bookService.ts/editionService.ts needs
 * to change.
 *
 * `NullTextMatcher` is provided as a default (same "always usable, even
 * before the real thing lands" role as db/events.ts's
 * NullEventAggregator): `cleanName` is identity, `fuzzyMatch` always
 * returns 0 (no match), so inexact-match search methods degrade to
 * "returns no candidates" rather than throwing, and exact-match methods
 * (FindById, FindByName, etc. -- which don't depend on Parser at all) are
 * completely unaffected.
 */

export interface ITextMatcher {
  /** Ported from Parser.CleanAuthorName(this string name): normalizes a name/title for exact-match comparison (lowercases, strips punctuation, etc). */
  cleanAuthorName(name: string): string;

  /** Ported from StringExtensions.FuzzyMatch(this string a, string b): a 0..1 similarity score. */
  fuzzyMatch(a: string, b: string): number;

  /** Ported from FuzzyContainsExtension.FuzzyContains(this string text, string pattern): a 0..1 substring-similarity score. */
  fuzzyContains(text: string, pattern: string): number;

  /** Ported from Parser.RemoveBracketsAndContents(this string book). */
  removeBracketsAndContents(text: string): string;

  /** Ported from Parser.RemoveAfterDash(this string text). */
  removeAfterDash(text: string): string;

  /** Ported from Parser.SplitBookTitle(this string book, string author): returns [titleWithoutAuthorPrefix, matchedAuthorPrefix]. */
  splitBookTitle(book: string, author: string): [string, string];
}

/** Default no-op matcher -- see this module's doc comment for the degrade-gracefully rationale. */
export class NullTextMatcher implements ITextMatcher {
  cleanAuthorName(name: string): string {
    return name;
  }
  fuzzyMatch(): number {
    return 0;
  }
  fuzzyContains(): number {
    return 0;
  }
  removeBracketsAndContents(text: string): string {
    return text;
  }
  removeAfterDash(text: string): string {
    return text;
  }
  splitBookTitle(book: string): [string, string] {
    return [book, ""];
  }
}

/**
 * Ported from AuthorService/BookService/EditionService's private
 * `FindByStringInexact` helper: given a list of items, a scoring function,
 * and a query string, scores every item, sorts descending, then keeps a
 * leading run of that sorted list bounded by two independent `TakeWhile`
 * cutoffs (chained in C# as `sorted.TakeWhile(gapPred).TakeWhile(thresholdPred)`):
 *   - `fuzzGap`: stop as soon as the score drop from the previous item
 *     (in the *original* sorted order) reaches/exceeds this gap.
 *   - `fuzzThreshold`: stop as soon as an item's own score is at/below the
 *     threshold AND the previous item's score was also at/below it (so a
 *     close-second right at the threshold boundary isn't dropped only
 *     because of floating-point tie-breaking).
 *
 * Both predicates index against the *original* sorted array (not each
 * other's truncated output) -- C#'s `.TakeWhile(...).TakeWhile(...)` chain
 * still has both lambdas closing over the same `sortedAuthors` list, it's
 * only the enumeration that's chained. So the final result is simply the
 * original sorted list's prefix up to whichever of the two independent
 * stopping points comes first.
 */
export function findByStringInexact<T>(
  items: T[],
  scoreFn: (item: T) => number,
  fuzzThreshold: number,
  fuzzGap: number
): T[] {
  const scored = items
    .map((item) => ({ matchProb: scoreFn(item), item }))
    .sort((a, b) => b.matchProb - a.matchProb);

  let gapCutoff = scored.length;
  for (let i = 1; i < scored.length; i++) {
    if (scored[i - 1]!.matchProb - scored[i]!.matchProb >= fuzzGap) {
      gapCutoff = i;
      break;
    }
  }

  let thresholdCutoff = scored.length;
  for (let i = 0; i < scored.length; i++) {
    const ok = scored[i]!.matchProb > fuzzThreshold || (i > 0 && scored[i - 1]!.matchProb > fuzzThreshold);
    if (!ok) {
      thresholdCutoff = i;
      break;
    }
  }

  const cutoff = Math.min(gapCutoff, thresholdCutoff);
  return scored.slice(0, cutoff).map((x) => x.item);
}
