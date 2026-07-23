import type { Language } from "../languages/index.js";

/**
 * Ported from NzbDrone.Core/Parser/IsoLanguage.cs.
 *
 * `Language` here is the real ported `apps/server/src/languages/` value
 * object (Phase 1, already landed), not a forward-reference.
 */
export interface IsoLanguage {
  twoLetterCode: string;
  threeLetterCode: string;
  countryCode: string;
  englishName: string;
  language: Language;
}

export function newIsoLanguage(
  twoLetterCode: string,
  countryCode: string,
  threeLetterCode: string,
  englishName: string,
  language: Language
): IsoLanguage {
  return { twoLetterCode, threeLetterCode, countryCode, englishName, language };
}
