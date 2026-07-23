import { levenshteinCoefficient } from "../../../parser/stringMatching.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Identification/Distance.cs.
 *
 * A "beets"-style match-confidence accumulator: each named penalty
 * contributes a 0.0-1.0 distance value (possibly several per key, e.g. one
 * `AddNumber` call per unit of numeric difference), weighted by a fixed
 * per-key weight table, and normalized against the maximum possible
 * distance for the penalties actually recorded.
 *
 * `parser/model/localBook.ts` and `parser/model/localEdition.ts` (already
 * ported, Phase 2) declare `distance: unknown` as an explicit placeholder
 * for this exact type -- see those files' doc comments. This module is
 * the real owner of `Distance`; callers in this module use it directly.
 * Wiring it back into `LocalBook`/`LocalEdition`'s `distance` field
 * happens at this module's own call sites (see identification/*.ts) via a
 * local narrowing, since editing parser/model/*.ts is out of this
 * worktree's scope (see this module's forward-reference discipline).
 */

/** Ported from Distance.cs's private static `Weights` dictionary ("from beets default config"). */
const WEIGHTS: ReadonlyMap<string, number> = new Map([
  ["source", 2.0],
  ["author", 3.0],
  ["book", 3.0],
  ["isbn", 10.0],
  ["isbn_missing", 0.1],
  ["asin", 10.0],
  ["asin_missing", 0.1],
  ["media_count", 1.0],
  ["ebook_format", 0.1],
  ["audio_format", 0.1],
  ["wrong_format", 5.0],
  ["year", 1.0],
  ["country", 0.5],
  ["language", 5.0],
  ["publisher", 0.5],
  ["catalog_number", 0.5],
  ["book_disambiguation", 0.5],
  ["book_id", 5.0],
  ["tracks", 2.0],
  ["missing_tracks", 0.6],
  ["unmatched_tracks", 0.9],
  ["track_title", 3.0],
  ["track_author", 2.0],
  ["track_index", 1.0],
  ["track_length", 2.0],
  ["recording_id", 10.0],
]);

function weightFor(key: string): number {
  const w = WEIGHTS.get(key);
  if (w === undefined) {
    // Ported behavior: C#'s Dictionary<string, double> indexer throws
    // KeyNotFoundException for an unknown key. Any key added via
    // Add()/AddString()/etc must exist in WEIGHTS above, exactly like the
    // C# source -- this is not a "handle it gracefully" situation.
    throw new Error(`The given key '${key}' was not present in the dictionary.`);
  }
  return w;
}

export class Distance {
  private readonly penaltiesMap = new Map<string, number[]>();

  /** Ported from `Distance.Penalties` (read-only view of the accumulated per-key distance lists). */
  get penalties(): ReadonlyMap<string, readonly number[]> {
    return this.penaltiesMap;
  }

  /**
   * Ported from `Distance.Reasons`: bracketed, comma-joined list of penalty
   * keys (underscores replaced with spaces) whose max recorded value is
   * greater than 0, or empty string if none.
   */
  get reasons(): string {
    const withPenalty = [...this.penaltiesMap.entries()].filter(
      ([, values]) => Math.max(...values) > 0.0
    );
    if (withPenalty.length === 0) {
      return "";
    }
    return `[${withPenalty.map(([key]) => key.replace(/_/g, " ")).join(", ")}]`;
  }

  private maxDistanceOf(penalties: ReadonlyMap<string, number[]>): number {
    let total = 0;
    for (const [key, values] of penalties) {
      total += values.length * weightFor(key);
    }
    return total;
  }

  /** Ported from the public `Distance.MaxDistance()` (no-args overload). */
  maxDistance(): number {
    return this.maxDistanceOf(this.penaltiesMap);
  }

  private rawDistanceOf(penalties: ReadonlyMap<string, number[]>): number {
    let total = 0;
    for (const [key, values] of penalties) {
      total += values.reduce((a, b) => a + b, 0) * weightFor(key);
    }
    return total;
  }

  /** Ported from the public `Distance.RawDistance()` (no-args overload). */
  rawDistance(): number {
    return this.rawDistanceOf(this.penaltiesMap);
  }

  private normalizedDistanceOf(penalties: ReadonlyMap<string, number[]>): number {
    const max = this.maxDistanceOf(penalties);
    return max > 0 ? this.rawDistanceOf(penalties) / max : 0;
  }

  /** Ported from `Distance.NormalizedDistance()`. */
  normalizedDistance(): number {
    return this.normalizedDistanceOf(this.penaltiesMap);
  }

  /** Ported from `Distance.NormalizedDistanceExcluding(List<string> keys)`. */
  normalizedDistanceExcluding(keys: string[]): number {
    const filtered = new Map(
      [...this.penaltiesMap.entries()].filter(([key]) => !keys.includes(key))
    );
    return this.normalizedDistanceOf(filtered);
  }

  /** Ported from `Distance.Add(string key, double dist)`. */
  add(key: string, dist: number): void {
    const existing = this.penaltiesMap.get(key);
    if (existing) {
      existing.push(dist);
    } else {
      this.penaltiesMap.set(key, [dist]);
    }
  }

  /** Ported from `Distance.AddRatio(string key, double value, double target)`. */
  addRatio(key: string, value: number, target: number): void {
    const dist = target > 0 ? Math.max(Math.min(value, target), 0.0) / target : 0.0;
    this.add(key, dist);
  }

  /** Ported from `Distance.AddNumber(string key, int value, int target)`. */
  addNumber(key: string, value: number, target: number): void {
    const diff = Math.abs(value - target);
    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        this.add(key, 1.0);
      }
    } else {
      this.add(key, 0.0);
    }
  }

  /** Ported from the private `Distance.StringScore(string value, string target)`. */
  private stringScore(value: string, target: string): number {
    const cleanValue = clean(value);
    const cleanTarget = clean(target);

    if (cleanValue === "" && cleanTarget !== "") {
      return 1.0;
    } else if (cleanValue === "" && cleanTarget === "") {
      return 0.0;
    } else {
      return 1.0 - levenshteinCoefficient(cleanValue, cleanTarget);
    }
  }

  /** Ported from the `AddString(string key, string value, string target)` overload. */
  addString(key: string, value: string, target: string): void;
  /** Ported from the `AddString(string key, string value, List<string> options)` overload. */
  addString(key: string, value: string, options: string[]): void;
  /** Ported from the `AddString(string key, List<string> values, string target)` overload. */
  addString(key: string, values: string[], target: string): void;
  /** Ported from the `AddString(string key, List<string> values, List<string> options)` overload. */
  addString(key: string, values: string[], options: string[]): void;
  addString(
    key: string,
    valueOrValues: string | string[],
    targetOrOptions: string | string[]
  ): void {
    const valuesIsArray = Array.isArray(valueOrValues);
    const targetIsArray = Array.isArray(targetOrOptions);

    if (!valuesIsArray && !targetIsArray) {
      this.add(key, this.stringScore(valueOrValues, targetOrOptions));
      return;
    }

    if (!valuesIsArray && targetIsArray) {
      const value = valueOrValues;
      const options = targetOrOptions;
      if (options.length === 0) {
        this.add(key, this.stringScore(value, ""));
      } else {
        this.add(key, Math.min(...options.map((o) => this.stringScore(value, o))));
      }
      return;
    }

    if (valuesIsArray && !targetIsArray) {
      const values = valueOrValues;
      const target = targetOrOptions;
      if (values.length === 0) {
        this.add(key, this.stringScore("", target));
      } else {
        this.add(key, Math.min(...values.map((v) => this.stringScore(v, target))));
      }
      return;
    }

    // values: string[], options: string[]
    const values = valueOrValues as string[];
    const options = targetOrOptions as string[];
    if (values.length === 0 && options.length === 0) {
      this.add(key, 0.0);
    } else if (values.length === 0 || options.length === 0) {
      this.add(key, 1.0);
    } else {
      this.add(
        key,
        Math.min(...values.map((v) => Math.min(...options.map((o) => this.stringScore(v, o)))))
      );
    }
  }

  /** Ported from `Distance.AddBool(string key, bool expr)`. */
  addBool(key: string, expr: boolean): void {
    this.add(key, expr ? 1.0 : 0.0);
  }

  /**
   * Ported from `Distance.AddEquality<T>(string key, T value, List<T>
   * options)`. Uses `===` for equality, matching `IEquatable<T>.Equals` for
   * the primitive/string types this is actually called with in the real
   * source.
   */
  addEquality<T>(key: string, value: T, options: T[]): void {
    this.add(key, options.includes(value) ? 0.0 : 1.0);
  }

  /** Ported from `Distance.AddPriority<T>(string key, T value, List<T> options)`. */
  addPriority<T>(key: string, value: T, options: T[]): void {
    const unit = 1.0 / (options.length > 0 ? options.length : 1.0);
    const index = options.indexOf(value);
    if (index === -1) {
      this.add(key, 1.0);
    } else {
      this.add(key, index * unit);
    }
  }

  /** Ported from the `AddPriority<T>(string key, List<T> values, List<T> options)` overload. */
  addPriorityMany<T>(key: string, values: T[], options: T[]): void {
    for (let i = 0; i < options.length; i++) {
      if (values.includes(options[i] as T)) {
        this.add(key, i / options.length);
        return;
      }
    }
    this.add(key, 1.0);
  }
}

/**
 * Ported from the private static `Distance.Clean(string input)`: lowercase,
 * remove accents, keep only letters/digits. `removeAccent` mirrors
 * `parser.ts`'s private `removeAccent` helper (NFD-normalize + strip
 * combining marks) -- duplicated here rather than imported since that
 * helper isn't exported from parser.ts.
 */
function clean(input: string): string {
  const noAccent = input.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");

  return [...noAccent].filter((c) => isLetterOrDigit(c)).join("");
}

/** Ported from C#'s `char.IsLetterOrDigit(char)`: Unicode letter or digit category check. */
function isLetterOrDigit(ch: string): boolean {
  return /\p{L}|\p{N}/u.test(ch);
}
