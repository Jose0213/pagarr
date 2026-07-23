import { tryCreateRegex } from "./perlRegexFactory.js";
import { CaseInsensitiveTermMatcher, RegexTermMatcher, type ITermMatcher } from "./termMatchers.js";

/**
 * Ported from NzbDrone.Core/Profiles/Releases/TermMatcherService.cs.
 *
 * DEVIATION: `ICacheManager.GetCache<ITermMatcher>(GetType())`
 * (NzbDrone.Common.Cache, not yet ported) is replaced by a private
 * Map-based TTL cache, same approach and same 24h TTL as the original --
 * see delayProfileService.ts's identical deviation note for the reasoning.
 */
export class TermMatcherService {
  private readonly matcherCache = new Map<string, { matcher: ITermMatcher; expiresAt: number }>();
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;

  isMatch(term: string, value: string): boolean {
    return this.getMatcher(term).isMatch(value);
  }

  matchingTerm(term: string, value: string): string | null {
    return this.getMatcher(term).matchingTerm(value);
  }

  getMatcher(term: string): ITermMatcher {
    const now = Date.now();
    const cached = this.matcherCache.get(term);
    if (cached && cached.expiresAt > now) {
      return cached.matcher;
    }

    const matcher = this.createMatcherInternal(term);
    this.matcherCache.set(term, { matcher, expiresAt: now + TermMatcherService.TTL_MS });
    return matcher;
  }

  private createMatcherInternal(term: string): ITermMatcher {
    const regex = tryCreateRegex(term);

    if (regex !== null) {
      return new RegexTermMatcher(regex);
    }

    return new CaseInsensitiveTermMatcher(term);
  }
}
