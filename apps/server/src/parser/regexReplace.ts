/**
 * Ported from NzbDrone.Core/Parser/RegexReplace.cs.
 *
 * C# overloaded the constructor on `string replacement` vs `MatchEvaluator
 * replacement`; TS doesn't have constructor overloading, so
 * `RegexReplace`'s constructor takes either a plain string or a callback
 * (`(match: string) => string`, mirroring JS's native `String.replace`
 * callback shape rather than C#'s full `Match` object, since none of this
 * module's actual `MatchEvaluator` usage -- see parser.ts's
 * `RemoveFileExtension` -- needs anything from `Match` beyond the matched
 * text itself).
 */
export type ReplacementFn = (matched: string) => string;

export class RegexReplace {
  private readonly regex: RegExp;
  private readonly replacementFormat: string | undefined;
  private readonly replacementFunc: ReplacementFn | undefined;

  constructor(pattern: string, replacement: string | ReplacementFn, flags: string) {
    // Always include "g" so .replace() replaces every match, matching C#'s
    // Regex.Replace (which replaces all matches unless a count is given).
    const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
    this.regex = new RegExp(pattern, normalizedFlags);

    if (typeof replacement === "string") {
      this.replacementFormat = replacement;
    } else {
      this.replacementFunc = replacement;
    }
  }

  replace(input: string): string {
    if (this.replacementFunc) {
      return input.replace(this.regex, (matched: string) => this.replacementFunc!(matched));
    }

    return input.replace(this.regex, this.replacementFormat ?? "");
  }

  /**
   * Ported from `RegexReplace.TryReplace(ref string input)`: returns
   * whether the pattern matched, and the replaced string via the mutable
   * `out` parameter pattern (`{ matched, result }` here, since TS has no
   * `ref`/`out` parameters).
   */
  tryReplace(input: string): { matched: boolean; result: string } {
    const matched = this.regex.test(input);
    // Reset lastIndex since `test()` on a global regex advances it.
    this.regex.lastIndex = 0;
    const result = this.replace(input);
    return { matched, result };
  }
}
