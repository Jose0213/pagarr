import { describe, expect, it } from "vitest";
import { findIsoCountry } from "../isoCountries.js";

/**
 * New tests (IsoCountries.cs has no dedicated C# test fixture). Covers
 * `Find`'s three branches: 2-letter code, 3-character prefix-of-2-letter-
 * code quirk (see isoCountries.ts's doc comment), and full name.
 */
describe("findIsoCountry", () => {
  it("finds by 2-letter code, case-insensitively", () => {
    expect(findIsoCountry("US")?.name).toBe("United States");
    expect(findIsoCountry("us")?.name).toBe("United States");
  });

  it("finds by full name, case-insensitively", () => {
    expect(findIsoCountry("germany")?.name).toBe("Germany");
    expect(findIsoCountry("GERMANY")?.name).toBe("Germany");
  });

  it("3-character input matches on the first 2 characters against TwoLetterCode (ported quirk)", () => {
    // "USA" -> first two chars "US" -> matches United States (there's no
    // ThreeLetterCode field on IsoCountry, this is faithful to the C# source).
    expect(findIsoCountry("USA")?.name).toBe("United States");
  });

  it("returns undefined for blank/null/undefined input", () => {
    expect(findIsoCountry("")).toBeUndefined();
    expect(findIsoCountry("   ")).toBeUndefined();
    expect(findIsoCountry(null)).toBeUndefined();
    expect(findIsoCountry(undefined)).toBeUndefined();
  });

  it("returns undefined for unknown values", () => {
    expect(findIsoCountry("ZZ")).toBeUndefined();
    expect(findIsoCountry("Not A Real Country")).toBeUndefined();
  });
});
