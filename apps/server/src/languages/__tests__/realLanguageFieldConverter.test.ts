import { describe, expect, it } from "vitest";
import { getRealLanguageSelectOptions } from "../realLanguageFieldConverter.js";
import { getAllLanguages } from "../language.js";

describe("getRealLanguageSelectOptions() -- ported from RealLanguageFieldConverter.GetSelectOptions", () => {
  it("excludes Unknown and Any", () => {
    const options = getRealLanguageSelectOptions();
    expect(options.some((o) => o.name === "Unknown")).toBe(false);
    expect(options.some((o) => o.name === "Any")).toBe(false);
  });

  it("includes Original (only Unknown/Any are filtered, matching the source's two explicit checks)", () => {
    const options = getRealLanguageSelectOptions();
    expect(options.some((o) => o.name === "Original")).toBe(true);
  });

  it("returns exactly Language.All minus the two pseudo-languages", () => {
    const options = getRealLanguageSelectOptions();
    const all = getAllLanguages();
    expect(options).toHaveLength(all.length - 2);
  });

  it("preserves relative order and maps value/name from id/name", () => {
    const options = getRealLanguageSelectOptions();
    expect(options[0]).toEqual({ value: 1, name: "English" });
  });
});
