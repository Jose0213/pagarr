import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ported from NzbDrone.Core/Localization/LocalizationService.cs --
 * ENGLISH-ONLY, pending real i18n scope.
 *
 * ## Why English-only
 *
 * The real service reads culture-keyed JSON dictionaries
 * (`Localization/Core/{culture}.json`, e.g. `fr.json`/`de.json`/`ja.json`
 * -- ~45 locale files in the real Readarr distribution) selected by
 * `IConfigService.UILanguage` (a `Language` enum this port's `config/`
 * module doesn't have, and no frontend exists anywhere in this repo to
 * ever *set* a non-English UI language in the first place -- see this
 * task's brief: "this port has no other locale files ported anywhere, no
 * frontend yet either"). Porting the full multi-locale
 * lookup/merge/culture-fallback machinery for a UI that doesn't exist yet
 * would be speculative scope creep with nothing to exercise it.
 *
 * This port ships ONLY `localization/Core/en.json` (copied verbatim from
 * the real Readarr source's own `en.json` -- the base culture every other
 * locale file layers on top of in `LocalizationService.GetDictionary`, so
 * it's also the most useful single file to have ported first) and a
 * `LocalizationService` that always serves it, regardless of any
 * language-selection input. This is a deliberate, minimal, faithful
 * stand-in -- NOT a claim that i18n is "done." When a real `config/`
 * `uiLanguage` setting and additional locale JSON files are ported, this
 * service's `getLocalizationDictionary()` should grow the real
 * culture-selection + base/override merge logic
 * (`GetDictionary`/`CopyInto`/`GetResourceFilename`) back in -- tracked
 * here as the explicit scope boundary, not silently treated as complete.
 *
 * ## What IS ported faithfully (English-only slice)
 *
 *   - `GetLocalizedString(phrase, tokens)`'s token-replacement behavior:
 *     `{token}` placeholders (case-insensitive alphanumeric token names,
 *     matching the real `TokenRegex` `(?:\{)(?<token>[a-z0-9]+)(?:\})`
 *     with `RegexOptions.IgnoreCase` -- ported as `/\{([a-zA-Z0-9]+)\}/g`,
 *     a plain unnamed capture group so this file is exempt from the
 *     duplicate-named-capture-group CI gotcha, see
 *     apps/server/scripts/check-regex-compat.mjs) are substituted from a
 *     caller-supplied token map, always includes an implicit `appName` =
 *     "Readarr" token (`tokens.TryAdd("appName", "Readarr")` -- ported as
 *     "set only if absent", matching `TryAdd`'s semantics exactly), and an
 *     unmatched token name is left as its own literal `{tokenName}` rather
 *     than being stripped or throwing.
 *   - `GetLocalizedString(phrase)` (no tokens) falls back to returning the
 *     phrase key itself, unchanged, when it isn't present in the
 *     dictionary -- ported literally.
 *   - `GetLocalizationDictionary()` returns the whole flat dictionary, case
 *     preserved on read (this port's `en.json` is single-locale, so there's
 *     no base/override merge to reproduce -- see above).
 *
 * `ICached<Dictionary<string,string>>`/`ICacheManager` (an in-memory cache
 * keyed by culture, cleared on `ConfigSavedEvent`) has no port here: the
 * dictionary is read from disk once, synchronously, at construction time
 * (`readFileSync`, matching the migrations-loading precedent in
 * db/db-factory.ts) and held in memory for the service's lifetime --
 * simpler than porting a cache abstraction for a single, never-changing
 * (no config to invalidate on) English dictionary.
 */
export interface ILocalizationService {
  getLocalizationDictionary(): Record<string, string>;
  getLocalizedString(phrase: string, tokens?: Record<string, unknown>): string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default path to the bundled English dictionary -- `localization/Core/en.json`, copied verbatim from the real Readarr source (see module doc comment). */
export const DEFAULT_EN_DICTIONARY_PATH = join(__dirname, "Core", "en.json");

/** Ported from the real `TokenRegex` -- see module doc comment for the named->unnamed capture group adaptation. */
const TOKEN_REGEX = /\{([a-zA-Z0-9]+)\}/g;

/**
 * Ported from `token?.ToString()` in `ReplaceTokens` -- C#'s `object.ToString()`
 * is always safe to call on any value. `String(value)` in TS is the direct
 * equivalent EXCEPT for a plain (non-`toString`-overriding) object, where
 * it degrades to the unhelpful `"[object Object]"` -- flagged by this
 * repo's `@typescript-eslint/no-base-to-string` lint rule. Every token
 * value this service actually receives is caller-supplied primitive data
 * (numbers, strings, dates-as-strings -- see this file's own tests), so
 * this narrows to the safe stringifiable cases explicitly rather than
 * disabling the lint rule; an actual plain-object token value falls back
 * to `String(value)` anyway (matching `ToString()`'s own behavior for an
 * unannotated C# object -- `"System.Object"`-style boilerplate, not
 * useful output either way, so no behavior is lost by not special-casing
 * it further).
 */
function stringifyToken(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export class LocalizationService implements ILocalizationService {
  private readonly dictionary: Record<string, string>;

  constructor(dictionaryPath: string = DEFAULT_EN_DICTIONARY_PATH) {
    const raw = readFileSync(dictionaryPath, "utf-8");
    this.dictionary = JSON.parse(raw) as Record<string, string>;
  }

  /** Ported from `LocalizationService.GetLocalizationDictionary()` -- English-only, see class doc comment. */
  getLocalizationDictionary(): Record<string, string> {
    return this.dictionary;
  }

  /** Ported from both `GetLocalizedString` overloads. */
  getLocalizedString(phrase: string, tokens: Record<string, unknown> = {}): string {
    if (!phrase) {
      throw new Error("phrase must not be empty");
    }

    const value = this.dictionary[phrase];
    if (value === undefined) {
      return phrase;
    }

    return this.replaceTokens(value, tokens);
  }

  /** Ported from `LocalizationService.ReplaceTokens`. */
  private replaceTokens(input: string, tokens: Record<string, unknown>): string {
    const withAppName: Record<string, unknown> = { appName: "Readarr", ...tokens };

    return input.replace(TOKEN_REGEX, (fullMatch, tokenName: string) => {
      const value = withAppName[tokenName];
      return value !== undefined && value !== null ? stringifyToken(value) : fullMatch;
    });
  }
}
