/**
 * Ported from
 * NzbDrone.Core/Profiles/Releases/TermMatchers/{ITermMatcher,
 * CaseInsensitiveTermMatcher, RegexTermMatcher}.cs.
 */
export interface ITermMatcher {
  isMatch(value: string): boolean;
  matchingTerm(value: string): string | null;
}

/** Ported from CaseInsensitiveTermMatcher.cs. */
export class CaseInsensitiveTermMatcher implements ITermMatcher {
  private readonly originalTerm: string;
  private readonly term: string;

  constructor(term: string) {
    this.originalTerm = term;
    this.term = term.toLowerCase();
  }

  isMatch(value: string): boolean {
    return value.toLowerCase().includes(this.term);
  }

  matchingTerm(value: string): string | null {
    if (value.toLowerCase().includes(this.term)) {
      return this.originalTerm;
    }
    return null;
  }
}

/** Ported from RegexTermMatcher.cs. */
export class RegexTermMatcher implements ITermMatcher {
  constructor(private readonly regex: RegExp) {}

  isMatch(value: string): boolean {
    return this.regex.test(value);
  }

  matchingTerm(value: string): string | null {
    const match = this.regex.exec(value);
    // Ported from Regex.Match(value).Value: .NET's Match.Value is "" (never
    // null) when there's no match -- JS's RegExp.exec returns null instead,
    // so this normalizes back to "" to match the C# return type/behavior
    // exactly (callers compare this against a term list expecting a string).
    return match ? match[0] : "";
  }
}
