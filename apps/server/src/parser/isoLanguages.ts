import * as LanguageValues from "../languages/index.js";
import type { Language } from "../languages/index.js";
import { newIsoLanguage, type IsoLanguage } from "./isoLanguage.js";

/**
 * Ported from NzbDrone.Core/Parser/IsoLanguages.cs.
 *
 * Uses the real ported `apps/server/src/languages/` `Language` values
 * directly (Phase 1, already landed) -- not a forward-reference.
 */
const All: readonly IsoLanguage[] = [
  newIsoLanguage("en", "", "eng", "English", LanguageValues.English),
  newIsoLanguage("fr", "fr", "fra", "French", LanguageValues.French),
  newIsoLanguage("es", "", "spa", "Spanish", LanguageValues.Spanish),
  newIsoLanguage("de", "de", "deu", "German", LanguageValues.German),
  newIsoLanguage("it", "", "ita", "Italian", LanguageValues.Italian),
  newIsoLanguage("da", "", "dan", "Danish", LanguageValues.Danish),
  newIsoLanguage("nl", "", "nld", "Dutch", LanguageValues.Dutch),
  newIsoLanguage("ja", "", "jpn", "Japanese", LanguageValues.Japanese),
  newIsoLanguage("is", "", "isl", "Icelandic", LanguageValues.Icelandic),
  newIsoLanguage("zh", "cn", "zho", "Chinese", LanguageValues.Chinese),
  newIsoLanguage("ru", "", "rus", "Russian", LanguageValues.Russian),
  newIsoLanguage("pl", "", "pol", "Polish", LanguageValues.Polish),
  newIsoLanguage("vi", "", "vie", "Vietnamese", LanguageValues.Vietnamese),
  newIsoLanguage("sv", "", "swe", "Swedish", LanguageValues.Swedish),
  newIsoLanguage("no", "", "nor", "Norwegian", LanguageValues.Norwegian),
  newIsoLanguage("nb", "", "nob", "Norwegian Bokmal", LanguageValues.Norwegian),
  newIsoLanguage("fi", "", "fin", "Finnish", LanguageValues.Finnish),
  newIsoLanguage("tr", "", "tur", "Turkish", LanguageValues.Turkish),
  newIsoLanguage("pt", "pt", "por", "Portuguese", LanguageValues.Portuguese),
  newIsoLanguage("el", "", "ell", "Greek", LanguageValues.Greek),
  newIsoLanguage("ko", "", "kor", "Korean", LanguageValues.Korean),
  newIsoLanguage("hu", "", "hun", "Hungarian", LanguageValues.Hungarian),
  newIsoLanguage("he", "", "heb", "Hebrew", LanguageValues.Hebrew),
  newIsoLanguage("cs", "", "ces", "Czech", LanguageValues.Czech),
  newIsoLanguage("hi", "", "hin", "Hindi", LanguageValues.Hindi),
  newIsoLanguage("th", "", "tha", "Thai", LanguageValues.Thai),
  newIsoLanguage("bg", "", "bul", "Bulgarian", LanguageValues.Bulgarian),
  newIsoLanguage("ro", "", "ron", "Romanian", LanguageValues.Romanian),
  newIsoLanguage("pt", "br", "", "Portuguese (Brazil)", LanguageValues.PortugueseBR),
  newIsoLanguage("ar", "", "ara", "Arabic", LanguageValues.Arabic),
];

/**
 * Ported from `IsoLanguages.Find(string isoCode)`.
 *
 * 2-letter codes may carry a country suffix (`en-US`, `pt-BR`); if a
 * country-scoped match exists among the candidates, it wins, otherwise
 * falls back to the (only) candidate with no country code at all --
 * ported 1:1 including the C# quirk that this fallback only runs when
 * `isoArray.Length > 1` (a bare 2-letter code with no dash skips the
 * country-code filtering step entirely and just returns the first
 * same-two-letter-code match, e.g. "pt" alone resolves to Portuguese, the
 * first `pt` entry, not Portuguese (Brazil)).
 */
export function findIsoLanguage(isoCode: string): IsoLanguage | undefined {
  const isoArray = isoCode.split("-");
  const langCode = (isoArray[0] ?? "").toLowerCase();

  if (langCode.length === 2) {
    let isoLanguagesForCode = All.filter((l) => l.twoLetterCode === langCode);

    if (isoArray.length > 1) {
      const countryCode = (isoArray[1] ?? "").toLowerCase();
      const hasCountryMatch = isoLanguagesForCode.some((l) => l.countryCode === countryCode);
      isoLanguagesForCode = hasCountryMatch
        ? isoLanguagesForCode.filter((l) => l.countryCode === countryCode)
        : isoLanguagesForCode.filter((l) => l.countryCode === "");
    }

    return isoLanguagesForCode[0];
  } else if (langCode.length === 3) {
    return All.find((l) => l.threeLetterCode === langCode);
  }

  return undefined;
}

/** Ported from `IsoLanguages.Get(Language language)`. */
export function getIsoLanguage(language: Language): IsoLanguage | undefined {
  return All.find((l) => l.language.id === language.id);
}

/**
 * Ported from `IsoLanguages.FindByName(string name)`. C# used
 * `StringComparison.InvariantCultureIgnoreCase`; `.toLowerCase()`
 * comparison is the practical TS equivalent for this fixed, all-ASCII-Latin
 * name list.
 */
export function findIsoLanguageByName(name: string): IsoLanguage | undefined {
  const trimmed = name.trim().toLowerCase();
  return All.find((l) => l.englishName.toLowerCase() === trimmed);
}

export const IsoLanguages = {
  All,
  Find: findIsoLanguage,
  Get: getIsoLanguage,
  FindByName: findIsoLanguageByName,
} as const;
