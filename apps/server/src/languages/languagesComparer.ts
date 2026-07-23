import type { Language } from "./language.js";

/**
 * Ported from NzbDrone.Core/Languages/LanguagesComparer.cs.
 *
 * C# implemented `IComparer<List<Language>>` for sorting rows/columns whose
 * value is a *list* of languages (e.g. multi-language editions), not a
 * single `Language`. The ordering, preserved exactly as the source coded
 * it (including its literal branch structure and the fact that the
 * `x.Count > 1 && y.Count == 1` / `x.Count == 1 && y.Count > 1` branches are
 * unreachable in practice once the `x.Count > y.Count` / `x.Count < y.Count`
 * branches above them fire for any two-vs-more-than-one-element lists --
 * this is a straight, faithful port of the original's redundant logic, not
 * a cleanup):
 *
 *   1. Both empty -> equal (0).
 *   2. Empty vs non-empty -> empty sorts after (1) / before (-1).
 *   3. Both have >1 element -> more languages sorts after fewer.
 *   4. One has >1 element, the other has exactly 1 -> the >1 list sorts
 *      after the single-language list.
 *   5. Both have exactly 1 element -> compare by language name
 *      (ordinal `string.CompareTo`, i.e. `<`/`>` in TS for plain strings).
 *   6. Otherwise (unreachable given 1-4 exhaust every count combination
 *      except this) -> equal (0).
 *
 * TypeScript's `Array.prototype.sort` comparator has the same contract as
 * C#'s `IComparer<T>.Compare` (negative/zero/positive), so this ports
 * directly to a comparator function rather than a class implementing an
 * interface -- there's no `IComparer<T>` equivalent worth preserving as a
 * class shape in TS.
 */
export function compareLanguageLists(x: Language[], y: Language[]): number {
  if (x.length === 0 && y.length === 0) {
    return 0;
  }

  if (x.length === 0 && y.length > 0) {
    return 1;
  }

  if (x.length > 0 && y.length === 0) {
    return -1;
  }

  if (x.length > 1 && y.length > 1 && x.length > y.length) {
    return 1;
  }

  if (x.length > 1 && y.length > 1 && x.length < y.length) {
    return -1;
  }

  if (x.length > 1 && y.length === 1) {
    return 1;
  }

  if (x.length === 1 && y.length > 1) {
    return -1;
  }

  if (x.length === 1 && y.length === 1) {
    const xName = x[0]!.name;
    const yName = y[0]!.name;
    return xName < yName ? -1 : xName > yName ? 1 : 0;
  }

  return 0;
}
