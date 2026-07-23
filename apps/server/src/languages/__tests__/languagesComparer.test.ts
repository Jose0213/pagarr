import { describe, expect, it } from "vitest";
import { compareLanguageLists } from "../languagesComparer.js";
import { English, French, German, Spanish } from "../language.js";

describe("compareLanguageLists() -- ported from LanguagesComparer.Compare", () => {
  it("two empty lists are equal", () => {
    expect(compareLanguageLists([], [])).toBe(0);
  });

  it("an empty list sorts after a non-empty list", () => {
    expect(compareLanguageLists([], [English])).toBe(1);
    expect(compareLanguageLists([English], [])).toBe(-1);
  });

  it("more languages sorts after fewer, when both have more than one", () => {
    expect(compareLanguageLists([English, French, German], [English, French])).toBe(1);
    expect(compareLanguageLists([English, French], [English, French, German])).toBe(-1);
  });

  it("a multi-language list sorts after a single-language list", () => {
    expect(compareLanguageLists([English, French], [English])).toBe(1);
    expect(compareLanguageLists([English], [English, French])).toBe(-1);
  });

  it("two single-language lists compare by name", () => {
    expect(compareLanguageLists([English], [French])).toBeLessThan(0);
    expect(compareLanguageLists([French], [English])).toBeGreaterThan(0);
    expect(compareLanguageLists([English], [English])).toBe(0);
  });

  it("two equal-length multi-language lists (>1) with equal counts return 0 (unreached-branch fallthrough)", () => {
    // Faithful to the source: with equal counts > 1, none of the ported
    // branches match, so Compare falls through to its final `return 0`.
    expect(compareLanguageLists([English, French], [German, Spanish])).toBe(0);
  });

  it("sorts a list of language-lists into the expected faithful order", () => {
    const lists = [
      [English, French, German],
      [],
      [French],
      [English],
      [English, French],
    ];

    lists.sort(compareLanguageLists);

    // Non-empty single sorted alphabetically first, then multi-language
    // lists (equal->stable, no reliable inter-order beyond count), then
    // empty lists last.
    expect(lists[0]).toEqual([English]);
    expect(lists[1]).toEqual([French]);
    expect(lists.slice(2, 4)).toEqual(
      expect.arrayContaining([
        [English, French],
        [English, French, German],
      ]),
    );
    expect(lists[4]).toEqual([]);
  });
});
