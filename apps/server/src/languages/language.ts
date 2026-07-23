/**
 * Ported from NzbDrone.Core/Languages/Language.cs.
 *
 * C# modeled `Language` as an `IEmbeddedDocument` value type -- a fixed,
 * hardcoded set of singleton-ish instances (each static property returns a
 * *new* `Language(id, name)` instance, not a cached singleton -- see below)
 * exposed as static properties (`Language.English`, `Language.French`, ...),
 * plus explicit conversion operators to/from `int`/`string`. It is never its
 * own DB table -- other domain models (e.g. `Edition`, `IsoLanguage` in the
 * Parser module) embed a `Language` value directly and it round-trips through
 * Dapper's `EmbeddedDocumentConverter<T>` as JSON. So this port is a plain
 * data module: a frozen list of language values plus the same lookup/compare
 * helpers, not a `BasicRepository`-backed entity.
 *
 * TypeScript has no operator overloading, so the C# `explicit operator
 * Language(int)` / `explicit operator int(Language)` / `explicit operator
 * Language(string)` casts are ported as named functions: `languageFromId`,
 * `languageToId` (trivial -- exposed for symmetry/readability at call sites
 * that ported a C# `(int)language` cast), and `languageFromName`.
 *
 * C# equality (`Equals`/`GetHashCode`/`==`/`!=`) compares only by `Id`, so
 * two differently-constructed `Language` instances with the same id are
 * equal. TS objects use reference equality by default, so this port adds
 * `languageEquals(a, b)` for the id-based comparison and callers should use
 * it (or compare `.id` directly) instead of `===`, mirroring what the C#
 * `==` operator did implicitly.
 */
export interface Language {
  readonly id: number;
  readonly name: string;
}

function makeLanguage(id: number, name: string): Language {
  return { id, name };
}

// --- Static language values, matching Language.cs's static properties ---
// Each C# static property allocated a fresh `Language` instance per access;
// this port instead creates one frozen instance per language up-front and
// reuses it (referenced, not reconstructed, from LANGUAGE_ALL below) -- an
// intentional, behavior-preserving simplification, since C#'s `Language`
// only ever compared by `Id` and never relied on reference identity.
export const Unknown: Language = makeLanguage(0, "Unknown");
export const English: Language = makeLanguage(1, "English");
export const French: Language = makeLanguage(2, "French");
export const Spanish: Language = makeLanguage(3, "Spanish");
export const German: Language = makeLanguage(4, "German");
export const Italian: Language = makeLanguage(5, "Italian");
export const Danish: Language = makeLanguage(6, "Danish");
export const Dutch: Language = makeLanguage(7, "Dutch");
export const Japanese: Language = makeLanguage(8, "Japanese");
export const Icelandic: Language = makeLanguage(9, "Icelandic");
export const Chinese: Language = makeLanguage(10, "Chinese");
export const Russian: Language = makeLanguage(11, "Russian");
export const Polish: Language = makeLanguage(12, "Polish");
export const Vietnamese: Language = makeLanguage(13, "Vietnamese");
export const Swedish: Language = makeLanguage(14, "Swedish");
export const Norwegian: Language = makeLanguage(15, "Norwegian");
export const Finnish: Language = makeLanguage(16, "Finnish");
export const Turkish: Language = makeLanguage(17, "Turkish");
export const Portuguese: Language = makeLanguage(18, "Portuguese");
export const Flemish: Language = makeLanguage(19, "Flemish");
export const Greek: Language = makeLanguage(20, "Greek");
export const Korean: Language = makeLanguage(21, "Korean");
export const Hungarian: Language = makeLanguage(22, "Hungarian");
export const Hebrew: Language = makeLanguage(23, "Hebrew");
export const Lithuanian: Language = makeLanguage(24, "Lithuanian");
export const Czech: Language = makeLanguage(25, "Czech");
export const Hindi: Language = makeLanguage(26, "Hindi");
export const Romanian: Language = makeLanguage(27, "Romanian");
export const Thai: Language = makeLanguage(28, "Thai");
export const Bulgarian: Language = makeLanguage(29, "Bulgarian");
export const PortugueseBR: Language = makeLanguage(30, "Portuguese (Brazil)");
export const Arabic: Language = makeLanguage(31, "Arabic");
export const Any: Language = makeLanguage(-1, "Any");
export const Original: Language = makeLanguage(-2, "Original");

/**
 * Ported from `Language.All`. C# rebuilt this list (of freshly-allocated
 * instances) on every access; this port returns a fresh array each call too
 * (matching "new list every time" semantics for callers that mutate the
 * returned list), but the `Language` elements themselves are the shared
 * frozen singletons above -- see the comment above `Unknown`.
 *
 * Order matches Language.cs's `All` getter exactly, including the fact that
 * Hindi/Romanian are swapped relative to their declaration order just above
 * it in the file (Romanian is declared after Hindi, but `All` lists Romanian
 * before Hindi) -- preserved here as-is, faithful to the source.
 */
export function getAllLanguages(): Language[] {
  return [
    Unknown,
    English,
    French,
    Spanish,
    German,
    Italian,
    Danish,
    Dutch,
    Japanese,
    Icelandic,
    Chinese,
    Russian,
    Polish,
    Vietnamese,
    Swedish,
    Norwegian,
    Finnish,
    Turkish,
    Portuguese,
    Flemish,
    Greek,
    Korean,
    Hungarian,
    Hebrew,
    Lithuanian,
    Czech,
    Romanian,
    Hindi,
    Thai,
    Bulgarian,
    PortugueseBR,
    Arabic,
    Any,
    Original,
  ];
}

/**
 * Ported from `Language.FindById(int id)`. Throws (matching C#'s
 * `ArgumentException`) when `id` doesn't match any known language -- id `0`
 * is special-cased to `Unknown` first, exactly as the source does, even
 * though `Unknown` is also present in `All` with id `0` and would be found
 * by the `FirstOrDefault` fallback anyway.
 */
export function languageFromId(id: number): Language {
  if (id === 0) {
    return Unknown;
  }

  const language = getAllLanguages().find((v) => v.id === id);

  if (!language) {
    throw new RangeError(`ID does not match a known language: ${id}`);
  }

  return language;
}

/**
 * Ported from `explicit operator int(Language)`. Trivial, but kept as a
 * named function (rather than having callers reach for `.id` directly) so
 * ported call sites that used the C# `(int)language` cast have a direct,
 * greppable equivalent.
 */
export function languageToId(language: Language): number {
  return language.id;
}

/**
 * Ported from `explicit operator Language(string lang)`. C# compared names
 * with `StringComparison.InvariantCultureIgnoreCase`; `.toLowerCase()`
 * comparison is the practical TS equivalent for the fixed, all-ASCII-Latin
 * language names in this list. Throws (matching C#'s `ArgumentException`)
 * when `lang` doesn't match any known language name.
 */
export function languageFromName(lang: string): Language {
  const language = getAllLanguages().find((v) => v.name.toLowerCase() === lang.toLowerCase());

  if (!language) {
    throw new RangeError(`Language does not match a known language: ${lang}`);
  }

  return language;
}

/** Ported from `Language.ToString()`. */
export function languageToString(language: Language): string {
  return language.name;
}

/**
 * Ported from `Language.Equals(Language)` / `operator ==`. C# compared only
 * by `Id` (and both treated `null`/`null` as equal, `null`/non-null as
 * unequal) -- mirrored here with `null`/`undefined`-safe id comparison since
 * TS has no operator overloading for `===`.
 */
export function languageEquals(
  left: Language | null | undefined,
  right: Language | null | undefined
): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }

  if (left === right) {
    return true;
  }

  return left.id === right.id;
}
