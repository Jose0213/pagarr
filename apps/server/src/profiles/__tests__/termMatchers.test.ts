import { describe, expect, it } from "vitest";
import { CaseInsensitiveTermMatcher, RegexTermMatcher } from "../releases/termMatchers.js";

/** Ported behavior from NzbDrone.Core/Profiles/Releases/TermMatchers/*.cs (no C# unit test exists to translate). */
describe("CaseInsensitiveTermMatcher", () => {
  it("matches case-insensitively via substring containment", () => {
    const matcher = new CaseInsensitiveTermMatcher("BadGroup");
    expect(matcher.isMatch("Some.Release.by.badgroup")).toBe(true);
    expect(matcher.isMatch("Some.Release.by.OtherGroup")).toBe(false);
  });

  it("matchingTerm returns the original (not lower-cased) term on match, null otherwise", () => {
    const matcher = new CaseInsensitiveTermMatcher("BadGroup");
    expect(matcher.matchingTerm("release.badgroup")).toBe("BadGroup");
    expect(matcher.matchingTerm("release.othergroup")).toBeNull();
  });
});

describe("RegexTermMatcher", () => {
  it("isMatch delegates to the wrapped regex", () => {
    const matcher = new RegexTermMatcher(/^foo\d+$/);
    expect(matcher.isMatch("foo123")).toBe(true);
    expect(matcher.isMatch("bar123")).toBe(false);
  });

  it("matchingTerm returns the matched substring, or empty string when there's no match", () => {
    const matcher = new RegexTermMatcher(/foo\d+/);
    expect(matcher.matchingTerm("xxfoo123yy")).toBe("foo123");
    expect(matcher.matchingTerm("nope")).toBe("");
  });
});
