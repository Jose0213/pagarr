/**
 * Ported from NzbDrone.Common/Extensions/StringExtensions.cs (FuzzyMatch/
 * LevenshteinCoefficient/RemoveBracketedText/ToLastFirst) and
 * NzbDrone.Common/Extensions/FuzzyContains.cs (FuzzyFind/FuzzyContains/
 * FuzzyMatch's Bitap approximate string search) and
 * NzbDrone.Common/Extensions/BerghelRoach.cs (LevenshteinDistance).
 *
 * ## Why these live under Parser, not a "Common" module
 *
 * These are `NzbDrone.Common` extension methods, not `NzbDrone.Core.Parser`
 * ones -- but `Parser.cs`'s `GetTitleFuzzy`/`ParseBookTitleWithSearchCriteria`
 * are their primary real caller in this codebase (`AuthorService.cs`/
 * `BookService.cs`/`EditionService.cs`'s inexact-match search also use them,
 * which is exactly why `books/textMatching.ts`'s `ITextMatcher` seam exists
 * -- see that file's doc comment). This port has no separate "Common"
 * module/worktree, and every real caller of this string-matching code is
 * either in this Parser module or depends on it via `ITextMatcher`, so it's
 * ported here rather than invented as a new top-level module. `realTextMatcher.ts`
 * in this same directory wires these functions up to satisfy Books'
 * `ITextMatcher` interface.
 *
 * ## Bitap implementation note (deviation from the C# source)
 *
 * C#'s `FuzzyContains.cs` genericizes its bit-parallel Bitap automaton over
 * three integer widths (`int`/`long`/`System.Numerics.BigInteger`, selected
 * by pattern length: <32/<64/else) purely so patterns under 32 or 64 chars
 * can use faster native-width arithmetic instead of always paying
 * BigInteger's allocation overhead. JavaScript's `bigint` is a single
 * arbitrary-precision integer type with no narrower-width fast path to
 * select between, so this port uses `bigint` uniformly for every pattern
 * length -- behaviorally identical to the C# source (same bitwise algorithm,
 * same results) with the width-selection optimization collapsed away since
 * it isn't expressible (or needed) in JS.
 *
 * ## LevenshteinDistance implementation note (deviation from the C# source)
 *
 * `BerghelRoach.cs`'s `ModifiedBerghelRoachEditDistance.GetDistance` is a
 * from-scratch reimplementation of Levenshtein edit distance using only
 * O(d) space and O(n*d) time (d = the edit distance itself) instead of the
 * standard O(n*m) dynamic-programming table -- a pure performance
 * optimization with no behavioral difference from standard Levenshtein
 * distance (same distance values, verified against
 * `LevenshteinDistanceFixture.cs`'s real test cases). This port uses a
 * standard O(n*m) DP table instead of replicating the diagonal-tracking
 * Berghel-Roach algorithm line-for-line -- same outputs, simpler and far
 * easier to verify correct in a new codebase. The `limit` parameter's
 * early-exit behavior (`return Math.Max(target.Length, pattern.Length)`
 * when the length difference alone exceeds `limit`) is preserved, since
 * that IS an observable part of `GetDistance`'s public contract (default
 * `limit = 20`, exercised by `LevenshteinDistance.cs`'s extension method).
 */

// ---------------------------------------------------------------------------
// Levenshtein distance (ported from BerghelRoach.cs's public contract)
// ---------------------------------------------------------------------------

/**
 * Ported from `ModifiedBerghelRoachEditDistance.GetDistance(string, string,
 * int limit = 20)`. See this module's doc comment for why a standard DP
 * table is used instead of the Berghel-Roach diagonal algorithm.
 */
export function getLevenshteinDistance(target: string, pattern: string, limit = 20): number {
  const distance = Math.abs(pattern.length - target.length);
  if (distance > limit) {
    // "More than we wanted. Give up right away" -- ported verbatim.
    return Math.max(target.length, pattern.length);
  }

  const n = target.length;
  const m = pattern.length;

  // Standard Levenshtein DP: dp[i][j] = distance(target[0..i), pattern[0..j)).
  let previousRow = new Array<number>(m + 1);
  let currentRow = new Array<number>(m + 1);

  for (let j = 0; j <= m; j++) {
    previousRow[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    currentRow[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = target[i - 1] === pattern[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        previousRow[j]! + 1, // deletion
        currentRow[j - 1]! + 1, // insertion
        previousRow[j - 1]! + cost // substitution / match
      );
    }

    const tmp = previousRow;
    previousRow = currentRow;
    currentRow = tmp;
  }

  return previousRow[m]!;
}

/** Ported from `StringExtensions.LevenshteinDistance(this string text, string other)`: thin alias over the (limit=20) default. */
export function levenshteinDistance(text: string, other: string): number {
  return getLevenshteinDistance(text, other, 20);
}

/** Ported from `StringExtensions.LevenshteinCoefficient(this string a, string b)`. */
export function levenshteinCoefficient(a: string, b: string): number {
  return 1.0 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

// ---------------------------------------------------------------------------
// FuzzyMatch(this string a, string b) -- word-aware Levenshtein similarity
// ---------------------------------------------------------------------------

/**
 * Ported from `StringExtensions.FuzzyMatch(this string a, string b)`: a 0..1
 * similarity score. Named `fuzzyMatchScore` (not `fuzzyMatch`) to
 * disambiguate from `fuzzyMatch` below (ported from `FuzzyContains.cs`'s
 * *different*, Bitap-based `FuzzyMatch(this string text, string pattern,
 * double matchThreshold, HashSet<char> wordDelimiters)` overload) -- C#
 * resolved these as overloads on argument count/types; TS needs distinct
 * names.
 */
export function fuzzyMatchScore(a: string, b: string): number {
  if (isBlank(a) || isBlank(b)) {
    return 0;
  }

  if (a.includes(" ") && b.includes(" ")) {
    const partsA = a.split(" ");
    const partsB = b.split(" ");

    const coef =
      (fuzzyMatchComponents(partsA, partsB) + fuzzyMatchComponents(partsB, partsA)) /
      (partsA.length + partsB.length);
    return Math.max(coef, levenshteinCoefficient(a, b));
  }

  return levenshteinCoefficient(a, b);
}

function fuzzyMatchComponents(a: string[], b: string[]): number {
  const weightDenom = Math.max(a.length, b.length);
  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    let high = 0.0;
    let indexDistance = 0;

    for (let x = 0; x < b.length; x++) {
      const coef = levenshteinCoefficient(a[i]!, b[x]!);
      if (coef > high) {
        high = coef;
        indexDistance = Math.abs(i - x);
      }
    }

    sum += (1.0 - indexDistance / weightDenom) * high;
  }

  return sum;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

// ---------------------------------------------------------------------------
// Bitap fuzzy search (ported from FuzzyContains.cs)
// ---------------------------------------------------------------------------

export interface BitapMatch {
  /** Best match start index, or -1 if no match found. */
  location: number;
  /** Length of the matched span (only meaningful when `wordDelimiters` was supplied -- 0 otherwise, matching the C# source). */
  length: number;
  /** Match score, 0 (bad) to 1 (perfect). */
  score: number;
}

/** Ported from `FuzzyContainsExtension.FuzzyFind(this string text, string pattern, double matchProb)`. */
export function fuzzyFind(text: string, pattern: string, matchProb: number): number {
  return fuzzyMatch(text, pattern, matchProb).location;
}

/** Ported from `FuzzyContainsExtension.FuzzyContains(this string text, string pattern)`. */
export function fuzzyContains(text: string, pattern: string): number {
  return fuzzyMatch(text, pattern, 0.25).score;
}

/**
 * Ported from `FuzzyContainsExtension.FuzzyMatch(this string text, string
 * pattern, double matchThreshold = 0.5, HashSet<char> wordDelimiters =
 * null)`. Locates the best instance of `pattern` in `text` using the Bitap
 * algorithm (bit-parallel approximate string matching, originally from
 * Google's diff-match-patch library). See this module's doc comment for the
 * `bigint`-uniform deviation from C#'s int/long/BigInteger width selection.
 */
export function fuzzyMatch(
  text: string,
  pattern: string,
  matchThreshold = 0.5,
  wordDelimiters: Set<string> | null = null
): BitapMatch {
  if (text.length === 0 || pattern.length === 0) {
    return { location: -1, length: 0, score: 0 };
  }

  if (pattern.length <= text.length && wordDelimiters === null) {
    const loc = text.indexOf(pattern);
    if (loc !== -1) {
      // Perfect match!
      return { location: loc, length: pattern.length, score: 1 };
    }
  }

  return matchBitap(text, pattern, matchThreshold, wordDelimiters);
}

const ZERO = 0n;
const ONE = 1n;

function matchBitap(
  text: string,
  pattern: string,
  matchThreshold: number,
  wordDelimiters: Set<string> | null
): BitapMatch {
  // Initialise the alphabet.
  const s = alphabet(pattern);

  // Lowest score below which we give up.
  let scoreThreshold = matchThreshold;

  // Initialise the bit arrays.
  const allOnes = ~ZERO;
  const oneComp = ~ONE;
  const matchmask = ONE << BigInt(pattern.length - 1);
  const matchmaskComp = ~matchmask;
  let bestLoc = -1;
  let bestLength = 0;

  let lastRd: bigint[] = [];
  const r: bigint[][] = [];

  const adjustForWordBoundary = wordDelimiters !== null;

  const start = 1;
  const finish = text.length + pattern.length;
  const charMatches: bigint[] = new Array<bigint>(finish);

  for (let c = start; c <= finish; c++) {
    let mask: bigint;
    if (text.length <= c - 1) {
      mask = allOnes;
    } else {
      const ch = text[c - 1]!;
      mask = s.has(ch) ? s.get(ch)! : allOnes;
    }

    charMatches[c - 1] = mask;
  }

  for (let d = 0; d < pattern.length; d++) {
    // Scan for the best match; each iteration allows for one more error.
    const rd: bigint[] = new Array<bigint>(finish + 2);

    rd[finish + 1] = ~((ONE << BigInt(d)) - ONE);

    if (wordDelimiters !== null) {
      r.push(rd);
    }

    for (let j = finish; j >= start; j--) {
      const charMatch = charMatches[j - 1]!;

      if (d === 0) {
        // First pass: exact match.
        rd[j] = (rd[j + 1]! << ONE) | charMatch;

        if (adjustForWordBoundary) {
          rd[j] = adjustForWordBoundaryFn(rd[j]!, j, text, wordDelimiters, oneComp, allOnes);
        }
      } else {
        // Subsequent passes: fuzzy match.
        // state if we assume exact match on char j
        let rdMatch = (rd[j + 1]! << ONE) | charMatch;

        // state if we assume substitution on char j
        let rdSub = lastRd[j + 1]! << ONE;

        // state if we assume insertion on char j
        let rdIns = lastRd[j]! << ONE;

        // state if we assume deletion at char j
        let rdDel = lastRd[j + 1]! & oneComp;

        if (adjustForWordBoundary) {
          rdMatch = adjustForWordBoundaryFn(rdMatch, j, text, wordDelimiters, oneComp, allOnes);
          rdSub = adjustForWordBoundaryFn(rdSub, j, text, wordDelimiters, oneComp, allOnes);
          rdIns = adjustForWordBoundaryFn(rdIns, j + 1, text, wordDelimiters, oneComp, allOnes);
          rdDel = adjustForWordBoundaryFn(rdDel, j - 1, text, wordDelimiters, oneComp, allOnes);
        }

        // the final state for this pass
        rd[j] = rdMatch & rdSub & rdIns & rdDel;
      }

      if ((rd[j]! | matchmaskComp) !== allOnes) {
        // This match will almost certainly be better than any existing
        // match. But check anyway.
        const score = bitapScore(d, pattern);

        let isOnWordBoundary = true;

        if (wordDelimiters !== null) {
          isOnWordBoundary =
            (j - 1 === 0 || wordDelimiters.has(text[j - 2]!)) && !wordDelimiters.has(text[j - 1]!);
        }

        if (score >= scoreThreshold && isOnWordBoundary) {
          // Told you so.
          scoreThreshold = score;
          bestLoc = j - 1;

          if (wordDelimiters !== null) {
            const match = getMatch(j, d, 0, r, matchmask, text, s);
            bestLength = match.length;
          }
        }
      }
    }

    lastRd = rd;

    if (bitapScore(d + 1, pattern) < scoreThreshold) {
      // No hope for a (better) match at greater error levels.
      break;
    }
  }

  return { location: bestLoc, length: bestLength, score: scoreThreshold };
}

function adjustForWordBoundaryFn(
  rdj: bigint,
  j: number,
  text: string,
  delimiters: Set<string>,
  oneComp: bigint,
  allOnes: bigint
): bigint {
  // if rdj == 1 then we are starting a new match. Only allow if on a word boundary
  if (rdj === oneComp && j < text.length && !delimiters.has(text[j]!)) {
    return allOnes;
  }

  return rdj;
}

function getMatch(
  j: number,
  d: number,
  shift: number,
  r: bigint[][],
  matchmask: bigint,
  text: string,
  s: Map<string, bigint>
): string[] {
  if (j > text.length) {
    return [];
  }

  const curr = text[j - 1]!;
  let take = true;
  let jj = j;
  let dd = d;
  let shiftShift = shift;

  const charMatch = s.has(curr) ? s.get(curr)! : ~ZERO;

  const rdMatch = ~((r[dd]![jj + 1]! << ONE) | charMatch) << BigInt(shiftShift);

  if ((rdMatch & matchmask) !== ZERO) {
    // an exact match on char j
    jj++;
    shiftShift++;
  } else if (dd > 0) {
    const rdIns = ~r[dd - 1]![jj]! << BigInt(shiftShift + 1);
    const rdSub = ~r[dd - 1]![jj + 1]! << BigInt(shiftShift + 1);
    const rdDel = ~r[dd - 1]![jj + 1]! << BigInt(shiftShift);

    dd--;

    if ((rdIns & matchmask) !== ZERO) {
      // actually insertion, don't take the character and run again with same j and bigger shift
      shiftShift++;
      take = false;
    } else if ((rdSub & matchmask) !== ZERO) {
      // substitution, take and carry on, just like exact
      shiftShift++;
      jj++;
    } else if ((rdDel & matchmask) !== ZERO) {
      // actually deletion
      jj++;
    }
  } else {
    // matchmask is zero or not a match
    return [];
  }

  const result = getMatch(jj, dd, shiftShift, r, matchmask, text, s);
  if (take) {
    result.unshift(curr);
  }

  return result;
}

/** Ported from `FuzzyContains.cs`'s `BitapScore(int e, string pattern)`. */
function bitapScore(e: number, pattern: string): number {
  return 1.0 - e / pattern.length;
}

/** Ported from `FuzzyContains.cs`'s `Alphabet<T>(string pattern, Calculator<T> calculator)`. */
function alphabet(pattern: string): Map<string, bigint> {
  const s = new Map<string, bigint>();

  let i = 0;
  for (const c of pattern) {
    const mask = ~(ONE << BigInt(pattern.length - i - 1));

    if (s.has(c)) {
      s.set(c, s.get(c)! & mask);
    } else {
      s.set(c, mask);
    }

    i++;
  }

  return s;
}

// ---------------------------------------------------------------------------
// RemoveBracketedText / ToLastFirst (ported from StringExtensions.cs)
// ---------------------------------------------------------------------------

const BRACKETS: ReadonlyMap<string, string> = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);
const R_MAP: ReadonlyMap<string, string> = new Map(Array.from(BRACKETS, ([k, v]) => [v, k]));

/** Ported from `StringExtensions.RemoveBracketedText(this string input)`. */
export function removeBracketedText(input: string): string {
  const counts = new Map<string, number>(Array.from(BRACKETS.keys(), (k) => [k, 0]));
  let total = 0;
  const buf: string[] = [];

  for (const c of input) {
    if (BRACKETS.has(c)) {
      counts.set(c, counts.get(c)! + 1);
      total += 1;
    } else if (R_MAP.has(c)) {
      const idx = R_MAP.get(c)!;
      const count = counts.get(idx)!;
      if (count > 0) {
        counts.set(idx, count - 1);
        total -= 1;
      }
    } else if (total < 1) {
      buf.push(c);
    }
  }

  return buf.join("");
}

const COPYWORDS = new Set([
  "agency",
  "corporation",
  "company",
  "co.",
  "council",
  "committee",
  "inc.",
  "institute",
  "national",
  "society",
  "club",
  "team",
]);

const SURNAME_PREFIXES = new Set(["da", "de", "di", "la", "le", "van", "von"]);

const PREFIXES = new Set(["mr", "mr.", "mrs", "mrs.", "ms", "ms.", "dr", "dr.", "prof", "prof."]);

const SUFFIXES = new Set([
  "jr",
  "sr",
  "inc",
  "ph.d",
  "phd",
  "md",
  "m.d",
  "i",
  "ii",
  "iii",
  "iv",
  "junior",
  "senior",
]);

/**
 * Ported from `StringExtensions.ToLastFirst(this string author)` (in turn
 * ported from calibre's `__init__.py` author-sort logic).
 */
export function toLastFirst(author: string | null | undefined): string | null {
  if (author === null || author === undefined) {
    return null;
  }

  const sauthor = removeBracketedText(author).trim();

  const tokens = sauthor.split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length < 2) {
    return author;
  }

  const ltoks = new Set(tokens.map((t) => t.toLowerCase()));

  if (Array.from(ltoks).some((t) => COPYWORDS.has(t))) {
    return author;
  }

  if (tokens.length === 2 && SURNAME_PREFIXES.has(tokens[0]!.toLowerCase())) {
    return author;
  }

  let first: number;
  for (first = 0; first < tokens.length; first++) {
    if (!PREFIXES.has(tokens[first]!.toLowerCase())) {
      break;
    }
  }

  if (first === tokens.length) {
    return author;
  }

  let last: number;
  for (last = tokens.length - 1; last >= first; last--) {
    if (!SUFFIXES.has(tokens[last]!.toLowerCase())) {
      break;
    }
  }

  if (last < first) {
    return author;
  }

  const suffix = tokens.slice(last + 1).join(" ");

  if (last > first && SURNAME_PREFIXES.has(tokens[last - 1]!.toLowerCase())) {
    tokens[last - 1] = tokens[last - 1] + " " + tokens[last];
    last -= 1;
  }

  const atokens = [tokens[last]!, ...tokens.slice(first, last)];
  const addComma = atokens.length > 1;

  if (suffix.trim() !== "") {
    atokens.push(suffix);
  }

  if (addComma) {
    atokens[0] = atokens[0] + ",";
  }

  return atokens.join(" ");
}
