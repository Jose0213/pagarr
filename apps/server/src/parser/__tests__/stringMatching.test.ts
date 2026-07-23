import { describe, expect, it } from "vitest";
import {
  fuzzyContains,
  fuzzyFind,
  fuzzyMatch,
  fuzzyMatchScore,
  getLevenshteinDistance,
  levenshteinDistance,
  removeBracketedText,
  toLastFirst,
} from "../stringMatching.js";

/**
 * Ported from NzbDrone.Common.Test/ExtensionTests/FuzzyContainsFixture.cs
 * and NzbDrone.Common.Test/LevenshteinDistanceFixture.cs.
 */

describe("fuzzyFind (FuzzyContainsFixture.FuzzyFind)", () => {
  it.each<[string, string, number, number]>([
    ["abcdef", "abcdef", 0.5, 0],
    ["", "abcdef", 0.5, -1],
    ["abcdef", "", 0.5, -1],
    ["", "", 0.5, -1],
    ["abcdef", "de", 0.5, 3],
    ["abcdef", "defy", 0.5, 3],
    ["abcdef", "abcdefy", 0.5, 0],
    ["I am the very model of a modern major general.", " that berry ", 0.3, 4],
    ["abcdefghijk", "fgh", 0.5, 5],
    ["abcdefghijk", "efxhi", 0.5, 4],
    ["abcdefghijk", "cdefxyhijk", 0.5, 2],
    ["abcdefghijk", "bxy", 0.5, -1],
    ["123456789xx0", "3456789x0", 0.5, 2],
    ["abcdef", "xxabc", 0.5, 0],
    ["abcdef", "defyy", 0.5, 3],
    ["abcdef", "xabcdefy", 0.5, 0],
    ["abcdefghijk", "efxyhi", 0.6, 4],
    ["abcdefghijk", "efxyhi", 0.7, -1],
    ["abcdefghijk", "bcdef", 0.0, 1],
    ["abcdexyzabcde", "abccde", 0.5, 0],
    ["abcdefghijklmnopqrstuvwxyz", "abcdxxefg", 0.5, 0],
    ["abcdefghijklmnopqrstuvwxyz", "abcdefg", 0.5, 0],
    [
      "The quick brown fox jumps over the lazy dog",
      "The quick brown fox jumps over the lazy d",
      0.5,
      0,
    ],
    [
      "The quick brown fox jumps over the lazy dog",
      "The quick brown fox jumps over the lazy g",
      0.5,
      0,
    ],
    [
      "The quick brown fox jumps over the lazy dog",
      "quikc brown fox jumps over the lazy dog",
      0.5,
      4,
    ],
    ["The quick brown fox jumps over the lazy dog", "qui jumps over the lazy dog", 0.5, 16],
    [
      "u6IEytQiYpzAccsbjQ5ISuE4smDQ1ZiU42cFBrTeKB2XrVLEqAvgIiKlDP75iApy07jzmK",
      "xEytQiYpzAccsbjQ5ISuE4smDQ1ZiU42cFBrTeKB2XrVLEqAvgIiKlDP75iApy07jzmK",
      0.5,
      2,
    ],
    ["plusifeelneedforredundantinformationintitlefield", "anthology", 0.5, -1],
  ])("FuzzyFind(%s, %s, %s) -> %s", (text, pattern, threshold, expected) => {
    expect(fuzzyFind(text, pattern, threshold)).toBe(expected);
  });
});

describe("fuzzyContains (FuzzyContainsFixture.FuzzyContains)", () => {
  it.each<[string, string, number]>([
    ["abcdef", "abcdef", 1],
    ["", "abcdef", 0],
    ["abcdef", "", 0],
    ["", "", 0],
    ["abcdef", "de", 1],
    ["abcdef", "defy", 0.75],
    ["abcdef", "abcdefghk", 6.0 / 9],
    ["abcdef", "zabcdefz", 6.0 / 8],
    ["plusifeelneedforredundantinformationintitlefield", "anthology", 4.0 / 9],
    ["+ (Plus) - I feel the need for redundant information in the title field", "+", 1],
  ])("FuzzyContains(%s, %s) -> %s", (text, pattern, expectedScore) => {
    expect(fuzzyContains(text, pattern)).toBeCloseTo(expectedScore, 9);
  });
});

describe("fuzzyMatch with word delimiters (FuzzyContainsFixture)", () => {
  it.each<[string, string, string, number]>([
    ["The quick brown fox jumps over the lazy dog", "The", " ", 0],
    ["The quick brown fox jumps over the lazy dog", "over", " ", 26],
    ["The quick brown fox jumps over the lazy dog", "dog", " ", 40],
  ])("should_find_exact_words: %s / %s -> %s", (text, pattern, delimiters, expected) => {
    const match = fuzzyMatch(text, pattern, 1, new Set(delimiters));
    expect(match.location).toBe(expected);
  });

  it.each<[string, string, string]>([
    ["The quick brown fox jumps over the lazy dog", "Th", " "],
    ["The quick brown fox jumps over the lazy dog", "The q", " "],
    ["The quick brown fox jumps over the lazy dog", "own", " "],
    ["The quick brown fox jumps over the lazy dog", "brow", " "],
    ["The quick brown fox jumps over the lazy dog", "og", " "],
    ["The quick brown fox jumps over the lazy dog", "do", " "],
  ])("should_not_find_exact_matches_that_are_not_words: %s / %s", (text, pattern, delimiters) => {
    const match = fuzzyMatch(text, pattern, 1, new Set(delimiters));
    expect(match.location).toBe(-1);
  });

  it.each<[string, string, string, number]>([
    ["The quick brown fox jumps over the lazy dog", "Th", " ", 0],
    ["The quick brown fox jumps over the lazy dog", "Te", " ", 0],
    ["The quick brown fox jumps over the lazy dog", "ovr", " ", 26],
    ["The quick brown fox jumps over the lazy dog", "oveer", " ", 26],
    ["The quick brown fox jumps over the lazy dog", "dog", " ", 40],
  ])("should_find_approximate_words: %s / %s -> %s", (text, pattern, delimiters, expected) => {
    const match = fuzzyMatch(text, pattern, 0.4, new Set(delimiters));
    expect(match.location).toBe(expected);
  });

  it.each<[string, string, string, number, number]>([
    ["The quick brown fox jumps over the lazy dog", "Th", " ", 0, 0.5],
    ["The quick brown fox jumps over the lazy dog", "The q", " ", 0, 0.6],
    ["The quick brown fox jumps over the lazy dog", "own", " ", 10, 0.3333],
    ["The quick brown fox jumps over the lazy dog", "brow", " ", 10, 0.75],
    ["The quick brown fox jumps over the lazy dog", "og", " ", 40, 0.5],
    ["The quick brown fox jumps over the lazy dog", "do", " ", 40, 0.5],
  ])(
    "should_find_approx_matches_that_are_not_words_with_lower_score: %s / %s -> loc=%s score=%s",
    (text, pattern, delimiters, expected, score) => {
      const match = fuzzyMatch(text, pattern, 0, new Set(delimiters));
      expect(match.location).toBe(expected);
      expect(match.score).toBeCloseTo(score, 3);
    }
  );

  it.each<[string, string, string, number, number, number]>([
    ["The quick brown fox jumps over the lazy dog", "ovr", " ", 26, 4, 0.6667],
    ["The quick brown fox jumps over the lazy dog", "eover", " ", 26, 4, 0.8],
    ["The quick brown fox jumps over the lazy dog", "jmps over", " ", 20, 10, 0.8888],
    ["The quick brown fox jumps over the lazy dog", "jmps ovr", " ", 20, 10, 0.75],
    ["The quick brown fox jumps over the lazy dog", "jumpss oveor", " ", 20, 10, 0.8334],
    ["The quick brown fox jumps over the lazy dog", "jummps ovver", " ", 20, 10, 0.8334],
    ["The quick brown fox jumps over the lazy dog", "hhumps over", " ", 20, 10, 0.8182],
    ["The quick brown fox jumps over the lazy dog", "hhumps ov", " ", 20, 10, 0.5556],
    ["The quick brown fox jumps over the lazy dog", "jumps ovea", " ", 20, 10, 0.9],
    ["The Hero George R R Martin", "George R.R. Martin", " .,_-=()[]|\"`'’", 9, 17, 0.8888],
  ])(
    "should_match_on_word_boundaries: %s / %s -> loc=%s len=%s score=%s",
    (text, pattern, delimiters, location, length, score) => {
      const match = fuzzyMatch(text, pattern, undefined, new Set(delimiters));
      expect(match.location).toBe(location);
      expect(match.length).toBe(length);
      expect(match.score).toBeCloseTo(score, 3);
    }
  );
});

describe("levenshteinDistance (LevenshteinDistanceFixture.LevenshteinDistance)", () => {
  it.each<[string, string, number]>([
    ["", "", 0],
    ["abc", "abc", 0],
    ["abc", "abcd", 1],
    ["abcd", "abc", 1],
    ["abc", "abd", 1],
    ["abc", "adc", 1],
    ["abcdefgh", "abcghdef", 4],
    ["a.b.c.", "abc", 3],
    ["Agents Of SHIELD", "Marvel's Agents Of S.H.I.E.L.D.", 15],
    ["Agents of cracked", "Agents of shield", 6],
    ["ABCxxx", "ABC1xx", 1],
    ["ABC1xx", "ABCxxx", 1],
  ])("LevenshteinDistance(%s, %s) -> %s", (text, other, expected) => {
    expect(levenshteinDistance(text, other)).toBe(expected);
  });
});

describe("fuzzyMatchScore (LevenshteinDistanceFixture.FuzzyMatchSymmetric / EmptyValuesReturnZero)", () => {
  it.each<[string, string]>([
    ["hello", "hello"],
    ["hello", "bye"],
    ["a longer string", "a different long string"],
  ])("FuzzyMatchSymmetric: %s <-> %s", (a, b) => {
    expect(fuzzyMatchScore(a, b)).toBe(fuzzyMatchScore(b, a));
  });

  it.each<[string, string, number]>([
    ["", "", 0],
    ["a", "", 0],
    ["", "a", 0],
  ])("FuzzyMatchEmptyValuesReturnZero: %s / %s -> %s", (a, b, expected) => {
    expect(fuzzyMatchScore(a, b)).toBe(expected);
  });
});

describe("getLevenshteinDistance (LevenshteinDistanceFixture.BMtest)", () => {
  it.each<[string, string, number]>([
    ["AVERY", "GARVEY", 3],
    ["ADCROFT", "ADDESSI", 5],
    ["BAIRD", "BAISDEN", 3],
    ["BOGGAN", "BOGGS", 2],
    ["CLAYTON", "CLEARY", 5],
    ["DYBAS", "DYCKMAN", 4],
    ["EMINETH", "EMMERT", 4],
    ["GALANTE", "GALICKI", 4],
    ["HARDIN", "HARDING", 1],
    ["KEHOE", "KEHR", 2],
    ["LOWRY", "LUBARSKY", 5],
    ["MAGALLAN", "MAGANA", 3],
    ["MAYO", "MAYS", 1],
    ["MOENY", "MOFFETT", 4],
    ["PARE", "PARENT", 2],
    ["RAMEY", "RAMFREY", 2],
  ])("BMtest: %s / %s -> %s", (a, b, expected) => {
    expect(getLevenshteinDistance(a, b, 10)).toBe(expected);
  });
});

describe("removeBracketedText", () => {
  it("removes balanced bracketed text", () => {
    expect(removeBracketedText("Foo (bar) baz")).toBe("Foo  baz");
    expect(removeBracketedText("Foo [bar] baz")).toBe("Foo  baz");
    expect(removeBracketedText("Foo {bar} baz")).toBe("Foo  baz");
  });

  it("handles nested brackets", () => {
    expect(removeBracketedText("Foo (bar (baz)) qux")).toBe("Foo  qux");
  });
});

describe("toLastFirst", () => {
  it("returns null for null input", () => {
    expect(toLastFirst(null)).toBeNull();
  });

  it("returns single-token names unchanged", () => {
    expect(toLastFirst("Prince")).toBe("Prince");
  });

  it("converts First Last to Last, First", () => {
    expect(toLastFirst("Stephen King")).toBe("King, Stephen");
  });

  it("leaves company-like names (with copywords) unchanged", () => {
    expect(toLastFirst("Acme Corporation")).toBe("Acme Corporation");
  });
});
