import { describe, expect, it } from "vitest";
import {
  Any,
  Arabic,
  Bulgarian,
  Chinese,
  Czech,
  Danish,
  Dutch,
  English,
  Finnish,
  Flemish,
  French,
  German,
  getAllLanguages,
  Greek,
  Hebrew,
  Hindi,
  Hungarian,
  Icelandic,
  Italian,
  Japanese,
  Korean,
  languageEquals,
  languageFromId,
  languageFromName,
  languageToId,
  languageToString,
  Lithuanian,
  Norwegian,
  Original,
  Polish,
  Portuguese,
  PortugueseBR,
  Romanian,
  Russian,
  Spanish,
  Swedish,
  Thai,
  Turkish,
  Unknown,
  Vietnamese,
} from "../language.js";
import type { Language } from "../language.js";

describe("Language static values", () => {
  it("Unknown is id 0", () => {
    expect(Unknown).toEqual({ id: 0, name: "Unknown" });
  });

  it("Any and Original use negative ids, matching Language.cs", () => {
    expect(Any).toEqual({ id: -1, name: "Any" });
    expect(Original).toEqual({ id: -2, name: "Original" });
  });

  it("PortugueseBR name includes the parenthetical, matching Language.cs exactly", () => {
    expect(PortugueseBR).toEqual({ id: 30, name: "Portuguese (Brazil)" });
  });

  it("every named language 1-31 has the expected id", () => {
    const expected: [Language, number][] = [
      [English, 1],
      [French, 2],
      [Spanish, 3],
      [German, 4],
      [Italian, 5],
      [Danish, 6],
      [Dutch, 7],
      [Japanese, 8],
      [Icelandic, 9],
      [Chinese, 10],
      [Russian, 11],
      [Polish, 12],
      [Vietnamese, 13],
      [Swedish, 14],
      [Norwegian, 15],
      [Finnish, 16],
      [Turkish, 17],
      [Portuguese, 18],
      [Flemish, 19],
      [Greek, 20],
      [Korean, 21],
      [Hungarian, 22],
      [Hebrew, 23],
      [Lithuanian, 24],
      [Czech, 25],
      [Hindi, 26],
      [Romanian, 27],
      [Thai, 28],
      [Bulgarian, 29],
      [PortugueseBR, 30],
      [Arabic, 31],
    ];

    for (const [language, id] of expected) {
      expect(language.id).toBe(id);
    }
  });
});

describe("getAllLanguages()", () => {
  it("returns exactly 34 languages, matching Language.All's element count", () => {
    expect(getAllLanguages()).toHaveLength(34);
  });

  it("preserves Language.All's exact declared order, including the Romanian/Hindi swap", () => {
    const names = getAllLanguages().map((l) => l.name);
    const romanianIndex = names.indexOf("Romanian");
    const hindiIndex = names.indexOf("Hindi");

    // Language.cs declares Hindi (26) before Romanian (27), but All lists
    // Romanian before Hindi -- this is preserved faithfully, not "fixed".
    expect(romanianIndex).toBeLessThan(hindiIndex);
    expect(names[0]).toBe("Unknown");
    expect(names[names.length - 1]).toBe("Original");
  });

  it("returns a fresh array each call (matching C#'s `new List<Language>` per access)", () => {
    const first = getAllLanguages();
    const second = getAllLanguages();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);

    // Mutating one returned list must not affect a later call.
    first.pop();
    expect(getAllLanguages()).toHaveLength(34);
  });

  it("all ids are unique", () => {
    const ids = getAllLanguages().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("languageFromId() -- ported from Language.FindById", () => {
  it("id 0 returns Unknown via the special-cased branch", () => {
    expect(languageFromId(0)).toEqual(Unknown);
  });

  it("resolves every known id to the matching language", () => {
    expect(languageFromId(1)).toEqual(English);
    expect(languageFromId(31)).toEqual(Arabic);
    expect(languageFromId(-1)).toEqual(Any);
    expect(languageFromId(-2)).toEqual(Original);
  });

  it("throws for an id that matches no known language, matching C#'s ArgumentException", () => {
    expect(() => languageFromId(9999)).toThrow(/does not match a known language/);
  });
});

describe("languageToId() -- ported from explicit operator int(Language)", () => {
  it("returns the language's id", () => {
    expect(languageToId(English)).toBe(1);
    expect(languageToId(Any)).toBe(-1);
  });
});

describe("languageFromName() -- ported from explicit operator Language(string)", () => {
  it("resolves an exact-case name", () => {
    expect(languageFromName("English")).toEqual(English);
  });

  it("is case-insensitive, matching StringComparison.InvariantCultureIgnoreCase", () => {
    expect(languageFromName("english")).toEqual(English);
    expect(languageFromName("ENGLISH")).toEqual(English);
    expect(languageFromName("EnGlIsH")).toEqual(English);
  });

  it("resolves a name containing spaces/parentheses", () => {
    expect(languageFromName("Portuguese (Brazil)")).toEqual(PortugueseBR);
    expect(languageFromName("portuguese (brazil)")).toEqual(PortugueseBR);
  });

  it("throws for a name that matches no known language, matching C#'s ArgumentException", () => {
    expect(() => languageFromName("Klingon")).toThrow(/does not match a known language/);
  });
});

describe("languageToString() -- ported from Language.ToString()", () => {
  it("returns the language's name", () => {
    expect(languageToString(English)).toBe("English");
    expect(languageToString(PortugueseBR)).toBe("Portuguese (Brazil)");
  });
});

describe("languageEquals() -- ported from Language.Equals / operator ==", () => {
  it("two distinct objects with the same id are equal (id-based, not reference-based)", () => {
    // languageFromId/languageFromName both resolve through the shared
    // singleton list (see language.ts's comment above `Unknown`), so build
    // genuinely distinct objects here to prove the comparison is id-based
    // rather than accidentally passing due to reference equality.
    const a: Language = { id: 1, name: "English" };
    const b: Language = { id: 1, name: "Some Other Name" };
    expect(a).not.toBe(b);
    expect(languageEquals(a, b)).toBe(true);
  });

  it("languageFromId/languageFromName return the same shared instance for the same language", () => {
    // Not a C#-mandated behavior (C# allocated a fresh instance per call),
    // but documents this port's intentional singleton-reuse simplification
    // (see language.ts's comment above `Unknown`) so a future change to
    // that design trips a test instead of going unnoticed.
    expect(languageFromId(1)).toBe(languageFromName("English"));
  });

  it("languages with different ids are not equal even with unrelated names", () => {
    expect(languageEquals(English, French)).toBe(false);
  });

  it("null/undefined vs null/undefined are equal, matching C#'s null-safe ==", () => {
    expect(languageEquals(null, null)).toBe(true);
    expect(languageEquals(undefined, undefined)).toBe(true);
    expect(languageEquals(null, undefined)).toBe(true);
  });

  it("null/undefined vs a real language are not equal", () => {
    expect(languageEquals(null, English)).toBe(false);
    expect(languageEquals(English, undefined)).toBe(false);
  });

  it("the same reference is trivially equal to itself", () => {
    expect(languageEquals(English, English)).toBe(true);
  });
});
