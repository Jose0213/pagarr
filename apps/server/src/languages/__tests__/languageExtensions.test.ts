import { describe, expect, it } from "vitest";
import { toExtendedString } from "../languageExtensions.js";
import { English, French, German } from "../language.js";

describe("toExtendedString() -- ported from LanguageExtensions.ToExtendedString", () => {
  it("joins language names with ', '", () => {
    expect(toExtendedString([English, French, German])).toBe("English, French, German");
  });

  it("returns an empty string for an empty collection", () => {
    expect(toExtendedString([])).toBe("");
  });

  it("returns just the name for a single-language collection", () => {
    expect(toExtendedString([English])).toBe("English");
  });

  it("accepts any Iterable<Language>, not just arrays (matching IEnumerable<Language>)", () => {
    function* gen() {
      yield English;
      yield French;
    }
    expect(toExtendedString(gen())).toBe("English, French");
  });
});
