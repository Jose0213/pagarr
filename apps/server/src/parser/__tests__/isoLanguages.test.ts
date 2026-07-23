import { describe, expect, it } from "vitest";
import * as Languages from "../../languages/index.js";
import { findIsoLanguage, findIsoLanguageByName, getIsoLanguage } from "../isoLanguages.js";

/**
 * New tests (IsoLanguages.cs has no dedicated C# test fixture). Covers the
 * country-code-scoping quirk documented in isoLanguages.ts's doc comment.
 */
describe("findIsoLanguage", () => {
  it("finds a plain 2-letter code", () => {
    expect(findIsoLanguage("en")?.englishName).toBe("English");
  });

  it("finds a 3-letter code", () => {
    expect(findIsoLanguage("eng")?.englishName).toBe("English");
    expect(findIsoLanguage("fra")?.englishName).toBe("French");
  });

  it("prefers the country-scoped match when one exists", () => {
    expect(findIsoLanguage("pt-br")?.englishName).toBe("Portuguese (Brazil)");
    expect(findIsoLanguage("pt-pt")?.englishName).toBe("Portuguese");
  });

  it("returns undefined when the country doesn't match any candidate and no candidate has an empty country code", () => {
    // Neither Portuguese entry in isoLanguages.ts has an empty CountryCode
    // (plain Portuguese is "pt", Brazil is "br") -- so for an unrecognized
    // country suffix like "pt-xx", the country-code filter yields an empty
    // list and Find returns undefined (isoLanguagesForCode[0] on an empty
    // array), never silently falling back to an arbitrary "pt" candidate.
    expect(findIsoLanguage("pt-xx")).toBeUndefined();
  });

  it("falls back to the country-code-less entry when one exists among duplicates and the requested country doesn't match", () => {
    // French does have both a country-scoped ("fr") and would need a
    // country-less counterpart to exercise the true fallback path; since
    // no language in this fixed dataset has 2+ entries where one carries
    // an empty CountryCode, this documents the logic via a code with only
    // ONE entry whose CountryCode is genuinely empty (English) -- an
    // unmatched country suffix on a single-entry code still falls through
    // to that one entry, since it's the only element left after filtering.
    expect(findIsoLanguage("en-zz")?.englishName).toBe("English");
  });

  it("a bare 2-letter code with no dash returns the first matching entry regardless of country scoping", () => {
    // Ported quirk: "pt" alone (no dash) skips the country-code filtering
    // step entirely (isoArray.Length > 1 is false) and returns the first
    // same-two-letter-code match in declared order, which is plain
    // Portuguese (declared before Portuguese (Brazil) in isoLanguages.ts).
    expect(findIsoLanguage("pt")?.englishName).toBe("Portuguese");
  });

  it("returns undefined for unknown codes", () => {
    expect(findIsoLanguage("zz")).toBeUndefined();
    expect(findIsoLanguage("zzz")).toBeUndefined();
    expect(findIsoLanguage("z")).toBeUndefined();
  });
});

describe("getIsoLanguage", () => {
  it("finds the IsoLanguage entry for a given Language value", () => {
    expect(getIsoLanguage(Languages.English)?.twoLetterCode).toBe("en");
    expect(getIsoLanguage(Languages.PortugueseBR)?.twoLetterCode).toBe("pt");
  });

  it("returns undefined for a Language with no IsoLanguage entry (e.g. Flemish)", () => {
    expect(getIsoLanguage(Languages.Flemish)).toBeUndefined();
  });
});

describe("findIsoLanguageByName", () => {
  it("finds by English name, case-insensitively and trimming whitespace", () => {
    expect(findIsoLanguageByName("English")?.twoLetterCode).toBe("en");
    expect(findIsoLanguageByName("  english  ")?.twoLetterCode).toBe("en");
    expect(findIsoLanguageByName("PORTUGUESE (BRAZIL)")?.twoLetterCode).toBe("pt");
  });

  it("returns undefined for unknown names", () => {
    expect(findIsoLanguageByName("Klingon")).toBeUndefined();
  });
});
