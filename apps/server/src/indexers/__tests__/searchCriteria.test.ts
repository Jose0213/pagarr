import { describe, expect, it } from "vitest";
import { getQueryTitle } from "../searchCriteria.js";

describe("getQueryTitle", () => {
  it("strips a leading 'the'", () => {
    expect(getQueryTitle("The Hobbit")).toBe("Hobbit");
  });

  it("substitutes 'Various Authors' with 'VA'", () => {
    expect(getQueryTitle("Various Authors")).toBe("VA");
  });

  it("collapses non-word runs (including the '&' separator and spaces) into +, without stripping a mid-string 'the'", () => {
    // Matches the real C# behavior exercised by NewznabRequestGeneratorFixture
    // .should_use_clean_title_and_encode: only a *leading* "the" is stripped
    // (BeginningThe is anchored with `^`), so "The" in the middle of the
    // title survives -- " & " becomes a space (explicit replace), then every
    // remaining space becomes "+" via the NonWord collapse.
    expect(getQueryTitle("Daisy Jones & The Six")).toBe("Daisy+Jones+The+Six");
  });

  it("removes periods", () => {
    expect(getQueryTitle("J.R.R. Tolkien")).toBe("J+R+R+Tolkien");
  });

  it("trims leading/trailing + after collapsing", () => {
    expect(getQueryTitle("!!!Loud Title!!!")).toBe("Loud+Title");
  });

  it("falls back to the original title if cleaning produces an empty string", () => {
    expect(getQueryTitle("!!!")).toBe("!!!");
  });

  it("throws for an empty/whitespace title", () => {
    expect(() => getQueryTitle("")).toThrow();
    expect(() => getQueryTitle("   ")).toThrow();
  });

  it("passes through an already-clean title unchanged", () => {
    expect(getQueryTitle("Foundation")).toBe("Foundation");
  });
});
