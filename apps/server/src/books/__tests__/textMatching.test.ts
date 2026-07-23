import { describe, expect, it } from "vitest";
import { findByStringInexact, NullTextMatcher } from "../textMatching.js";

describe("NullTextMatcher", () => {
  it("cleanAuthorName/removeBracketsAndContents/removeAfterDash are identity", () => {
    const matcher = new NullTextMatcher();
    expect(matcher.cleanAuthorName("Foo Bar")).toBe("Foo Bar");
    expect(matcher.removeBracketsAndContents("Foo [Bar]")).toBe("Foo [Bar]");
    expect(matcher.removeAfterDash("Foo - Bar")).toBe("Foo - Bar");
  });

  it("fuzzyMatch/fuzzyContains always return 0", () => {
    const matcher = new NullTextMatcher();
    expect(matcher.fuzzyMatch("a", "b")).toBe(0);
    expect(matcher.fuzzyContains("a", "b")).toBe(0);
  });

  it("splitBookTitle returns the book unchanged with an empty matched-prefix", () => {
    const matcher = new NullTextMatcher();
    expect(matcher.splitBookTitle("Some Book", "Some Author")).toEqual(["Some Book", ""]);
  });
});

describe("findByStringInexact", () => {
  it("keeps only items within fuzzGap of the top score, sorted descending", () => {
    const items = [
      { name: "a", score: 0.9 },
      { name: "b", score: 0.85 },
      { name: "c", score: 0.5 }, // gap from b (0.35) >= fuzzGap (0.2) -> cut off
    ];

    const result = findByStringInexact(items, (i) => i.score, 0.0, 0.2);
    expect(result.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("stops at the first item that fails the threshold check (and whose predecessor also failed)", () => {
    const items = [
      { name: "a", score: 0.9 }, // > 0.8 threshold: kept
      { name: "b", score: 0.75 }, // <= 0.8, but previous (a) was > 0.8: kept
      { name: "c", score: 0.6 }, // <= 0.8, and previous (b) was also <= 0.8: cutoff
      { name: "d", score: 0.59 },
    ];

    const result = findByStringInexact(items, (i) => i.score, 0.8, 1.0);
    expect(result.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("returns every item when all scores are identical and above threshold", () => {
    const items = [{ score: 0.9 }, { score: 0.9 }, { score: 0.9 }];
    const result = findByStringInexact(items, (i) => i.score, 0.5, 0.1);
    expect(result).toHaveLength(3);
  });

  it("returns an empty array when the top score is at/below threshold and no predecessor exception applies", () => {
    const items = [{ score: 0.3 }, { score: 0.2 }];
    const result = findByStringInexact(items, (i) => i.score, 0.5, 1.0);
    expect(result).toEqual([]);
  });

  it("handles an empty input list", () => {
    expect(findByStringInexact<{ score: number }>([], (i) => i.score, 0.5, 0.2)).toEqual([]);
  });
});
