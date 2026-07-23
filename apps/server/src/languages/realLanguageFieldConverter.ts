import { Any, getAllLanguages, languageEquals, Unknown } from "./language.js";
import type { FieldSelectOption } from "./fieldSelectOption.js";

/**
 * Ported from NzbDrone.Core/Languages/RealLanguageFieldConverter.cs.
 *
 * Same shape as `LanguageFieldConverter` (see languageFieldConverter.ts),
 * but excludes the two pseudo-languages (`Unknown`, `Any`) that don't
 * represent an actual real-world language -- used where the UI needs the
 * user to pick a *real* language (e.g. "release language" filters), as
 * opposed to a language-preference dropdown where "Any"/"Unknown" are valid
 * choices.
 *
 * C#'s `l != Language.Unknown` / `l != Language.Any` comparisons used
 * `Language`'s `==` operator overload (id-based equality, see
 * languageEquals in language.ts) -- ported as explicit `languageEquals`
 * calls since TS `!==` would be reference equality here.
 */
export function getRealLanguageSelectOptions(): FieldSelectOption[] {
  return getAllLanguages()
    .filter((l) => !languageEquals(l, Unknown) && !languageEquals(l, Any))
    .map((v) => ({ value: v.id, name: v.name }));
}
