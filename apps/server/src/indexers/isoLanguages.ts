import {
  type Language,
  Arabic,
  Bulgarian,
  Chinese,
  Czech,
  Danish,
  Dutch,
  English,
  Finnish,
  French,
  German,
  Greek,
  Hebrew,
  Hindi,
  Hungarian,
  Icelandic,
  Italian,
  Japanese,
  Korean,
  Norwegian,
  Polish,
  Portuguese,
  PortugueseBR,
  Romanian,
  Russian,
  Spanish,
  Swedish,
  Thai,
  Turkish,
  Vietnamese,
} from "../languages/language.js";

/**
 * FORWARD-REFERENCE NARROWING: ported from
 * NzbDrone.Core/Parser/IsoLanguages.cs, which lives in the not-yet-ported
 * `NzbDrone.Core.Parser` namespace (the same namespace `SearchCriteriaBase`
 * forward-references for `SplitBookTitle` -- see searchCriteria.ts's doc
 * comment). Unlike that title-splitting logic, `IsoLanguages` is small,
 * self-contained, and depends only on the already-ported `Language` module
 * (languages/language.ts) -- and `TorznabRssParser.GetLanguages()` /
 * `NewznabRssParser.GetLanguages()`, both squarely in this module's scope,
 * call `IsoLanguages.FindByName()` directly. Porting just this lookup table
 * (rather than stubbing GetLanguages to always return []) keeps those two
 * in-scope parsers behaviorally faithful; the rest of `Parser` (title
 * splitting, quality/language sniffing from release names, etc.) is left
 * for whichever later phase ports `NzbDrone.Core.Parser` in full.
 */
export interface IsoLanguage {
  twoLetterCode: string;
  countryCode: string;
  threeLetterCode: string;
  englishName: string;
  language: Language;
}

function iso(
  twoLetterCode: string,
  countryCode: string,
  threeLetterCode: string,
  englishName: string,
  language: Language
): IsoLanguage {
  return { twoLetterCode, countryCode, threeLetterCode, englishName, language };
}

const ALL: IsoLanguage[] = [
  iso("en", "", "eng", "English", English),
  iso("fr", "fr", "fra", "French", French),
  iso("es", "", "spa", "Spanish", Spanish),
  iso("de", "de", "deu", "German", German),
  iso("it", "", "ita", "Italian", Italian),
  iso("da", "", "dan", "Danish", Danish),
  iso("nl", "", "nld", "Dutch", Dutch),
  iso("ja", "", "jpn", "Japanese", Japanese),
  iso("is", "", "isl", "Icelandic", Icelandic),
  iso("zh", "cn", "zho", "Chinese", Chinese),
  iso("ru", "", "rus", "Russian", Russian),
  iso("pl", "", "pol", "Polish", Polish),
  iso("vi", "", "vie", "Vietnamese", Vietnamese),
  iso("sv", "", "swe", "Swedish", Swedish),
  iso("no", "", "nor", "Norwegian", Norwegian),
  iso("nb", "", "nob", "Norwegian Bokmal", Norwegian),
  iso("fi", "", "fin", "Finnish", Finnish),
  iso("tr", "", "tur", "Turkish", Turkish),
  iso("pt", "pt", "por", "Portuguese", Portuguese),
  iso("el", "", "ell", "Greek", Greek),
  iso("ko", "", "kor", "Korean", Korean),
  iso("hu", "", "hun", "Hungarian", Hungarian),
  iso("he", "", "heb", "Hebrew", Hebrew),
  iso("cs", "", "ces", "Czech", Czech),
  iso("hi", "", "hin", "Hindi", Hindi),
  iso("th", "", "tha", "Thai", Thai),
  iso("bg", "", "bul", "Bulgarian", Bulgarian),
  iso("ro", "", "ron", "Romanian", Romanian),
  iso("pt", "br", "", "Portuguese (Brazil)", PortugueseBR),
  iso("ar", "", "ara", "Arabic", Arabic),
];

/** Ported from IsoLanguages.Find(string isoCode). */
export function findIsoLanguage(isoCode: string): IsoLanguage | null {
  const isoArray = isoCode.split("-");
  const langCode = isoArray[0]!.toLowerCase();

  if (langCode.length === 2) {
    let isoLanguages = ALL.filter((l) => l.twoLetterCode === langCode);

    if (isoArray.length > 1) {
      const countryCode = isoArray[1]!.toLowerCase();
      isoLanguages = isoLanguages.some((l) => l.countryCode === countryCode)
        ? isoLanguages.filter((l) => l.countryCode === countryCode)
        : isoLanguages.filter((l) => l.countryCode === "");
    }

    return isoLanguages[0] ?? null;
  } else if (langCode.length === 3) {
    return ALL.find((l) => l.threeLetterCode === langCode) ?? null;
  }

  return null;
}

/** Ported from IsoLanguages.Get(Language language). */
export function getIsoLanguage(language: Language): IsoLanguage | null {
  return ALL.find((l) => l.language.id === language.id) ?? null;
}

/** Ported from IsoLanguages.FindByName(string name). */
export function findIsoLanguageByName(name: string): IsoLanguage | null {
  const trimmed = name.trim().toLowerCase();
  return ALL.find((l) => l.englishName.toLowerCase() === trimmed) ?? null;
}
