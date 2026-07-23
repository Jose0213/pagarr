import { describe, expect, it } from "vitest";
import { getLanguageSelectOptions } from "../languageFieldConverter.js";
import { getAllLanguages } from "../language.js";

describe("getLanguageSelectOptions() -- ported from LanguageFieldConverter.GetSelectOptions", () => {
  it("returns one select option per known language, in Language.All order", () => {
    const options = getLanguageSelectOptions();
    const all = getAllLanguages();

    expect(options).toHaveLength(all.length);
    options.forEach((opt, i) => {
      expect(opt.value).toBe(all[i]!.id);
      expect(opt.name).toBe(all[i]!.name);
    });
  });

  it("includes Unknown and Any, unlike RealLanguageFieldConverter", () => {
    const options = getLanguageSelectOptions();
    expect(options.some((o) => o.name === "Unknown")).toBe(true);
    expect(options.some((o) => o.name === "Any")).toBe(true);
  });
});
