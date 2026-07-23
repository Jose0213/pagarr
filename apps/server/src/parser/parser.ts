import type { Author, Book } from "../books/index.js";
import { RegexReplace } from "./regexReplace.js";
import { parseQuality, MediaFileExtensions } from "./qualityParser.js";
import { fuzzyMatch, toLastFirst, type BitapMatch } from "./stringMatching.js";
import { newParsedBookInfo, type ParsedBookInfo } from "./model/parsedBookInfo.js";
import { newParsedTrackInfo, type ParsedTrackInfo } from "./model/parsedTrackInfo.js";
import type { AuthorTitleInfo } from "./model/authorTitleInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/Parser.cs.
 *
 * ## Regex restructuring for JS engine compatibility
 *
 * `AirDateRegex` in the C# source is:
 * ```
 * ^(.*?)(?<!\d)((?<airyear>\d{4})[_.-](?<airmonth>[0-1][0-9])[_.-](?<airday>[0-3][0-9])|(?<airmonth>[0-1][0-9])[_.-](?<airday>[0-3][0-9])[_.-](?<airyear>\d{4}))(?!\d)
 * ```
 * This declares the same three named groups (`airyear`/`airmonth`/`airday`)
 * in BOTH alternation branches (YYYY-MM-DD vs MM-DD-YYYY). Valid .NET regex
 * (each branch is mutually exclusive), but a hard
 * `SyntaxError: Duplicate capture group name` in JS on the Node version
 * this project's CI pins to (22.14.0) -- see this worktree's CLAUDE.md and
 * `profiles/metadata/metadataProfileService.ts`'s `PART_OR_SET_REGEXES` for
 * the established fix pattern. Split into `AIR_DATE_REGEXES` below (tried
 * in order, first match wins -- same semantics as .NET's ordered
 * alternation): YYYY-MM-DD first, then MM-DD-YYYY, matching the C#
 * source's branch order.
 *
 * Every other regex in this file was checked for duplicate named groups
 * across `|` alternation branches and has none -- ported 1:1.
 *
 * ## Deviations
 *
 * - `ParseMusicPath`/`GetLocalBook`-style filesystem access
 *   (`System.IO.FileInfo`, `Path.GetDirectoryName`) uses Node's `path`
 *   module equivalents rather than .NET's `FileInfo`, which is the only
 *   observable difference (both resolve directory/file name splitting the
 *   same way for the inputs this module's real callers pass).
 * - `RemoveAccent` (`NzbDrone.Common.Extensions.StringExtensions`) is
 *   ported inline here (not in stringMatching.ts) since `CleanAuthorName`
 *   is this file's only real caller of it.
 */

// ---------------------------------------------------------------------------
// Regex library (ported 1:1 from Parser.cs's private static Regex fields)
// ---------------------------------------------------------------------------

const REPORT_MUSIC_TITLE_REGEX: readonly RegExp[] = [
  // Track with author (01 - author - trackName)
  /(?<trackNumber>\d*){0,1}([-| ]{0,1})(?<author>[a-zA-Z0-9, ().&_]*)[-| ]{0,1}(?<trackName>[a-zA-Z0-9, ().&_]+)/gi,

  // Track without author (01 - trackName)
  /(?<trackNumber>\d*)[-| .]{0,1}(?<trackName>[a-zA-Z0-9, ().&_]+)/gi,

  // Track without trackNumber or author(trackName)
  /(?<trackNumber>\d*)[-| .]{0,1}(?<trackName>[a-zA-Z0-9, ().&_]+)/gi,

  // Track without trackNumber and  with author(author - trackName)
  /(?<trackNumber>\d*)[-| .]{0,1}(?<trackName>[a-zA-Z0-9, ().&_]+)/gi,

  // Track with author and starting title (01 - author - trackName)
  /(?<trackNumber>\d*){0,1}[-| ]{0,1}(?<author>[a-zA-Z0-9, ().&_]*)[-| ]{0,1}(?<trackName>[a-zA-Z0-9, ().&_]+)/gi,
];

const REPORT_BOOK_TITLE_REGEX: readonly RegExp[] = [
  // ruTracker - (Genre) [Source]? Author - Discography
  /^(?:\(.+?\))(?:\W*(?:\[(?<source>.+?)\]))?\W*(?<author>.+?)(?: - )(?<discography>Discography|Discografia).+?(?<startyear>\d{4}).+?(?<endyear>\d{4})/gi,

  // Author - Discography with two years
  /^(?<author>.+?)(?: - )(?:.+?)?(?<discography>Discography|Discografia).+?(?<startyear>\d{4}).+?(?<endyear>\d{4})/gi,

  // Author - Discography with end year
  /^(?<author>.+?)(?: - )(?:.+?)?(?<discography>Discography|Discografia).+?(?<endyear>\d{4})/gi,

  // Author Discography with two years
  /^(?<author>.+?)\W*(?<discography>Discography|Discografia).+?(?<startyear>\d{4}).+?(?<endyear>\d{4})/gi,

  // Author Discography with end year
  /^(?<author>.+?)\W*(?<discography>Discography|Discografia).+?(?<endyear>\d{4})/gi,

  // Author Discography
  /^(?<author>.+?)\W*(?<discography>Discography|Discografia)/gi,

  // MyAnonaMouse - Title by Author [lang / pdf]
  /^(?<book>.+)\bby\b(?<author>.+?)(?:\[|\()/gi,

  // ruTracker - (Genre) [Source]? Author - Book - Year
  /^(?:\(.+?\))(?:\W*(?:\[(?<source>.+?)\]))?\W*(?<author>.+?)(?: - )(?<book>.+?)(?: - )(?<releaseyear>\d{4})/gi,

  // Author-Book-Version-Source-Year
  // ex. Imagine Dragons-Smoke And Mirrors-Deluxe Edition-2CD-FLAC-2015-JLM
  /^(?<author>.+?)[-](?<book>.+?)[-](?:[([]?)(?<version>.+?(?:Edition)?)(?:[)\]]?)[-](?<source>\d?CD|WEB).+?(?<releaseyear>\d{4})/gi,

  // Author-Book-Source-Year
  // ex. Dani_Sbert-Togheter-WEB-2017-FURY
  /^(?<author>.+?)[-](?<book>.+?)[-](?<source>\d?CD|WEB).+?(?<releaseyear>\d{4})/gi,

  // Author - Book (Year) Strict
  /^(?:(?<author>.+?)(?: - )+)(?<book>.+?)\W*(?:\(|\[).+?(?<releaseyear>\d{4})/gi,

  // Author - Book (Year)
  /^(?:(?<author>.+?)(?: - )+)(?<book>.+?)\W*(?:\(|\[)(?<releaseyear>\d{4})/gi,

  // Author - Book - Year [something]
  /^(?:(?<author>.+?)(?: - )+)(?<book>.+?)\W*(?: - )(?<releaseyear>\d{4})\W*(?:\(|\[)/gi,

  // Author - Book [something] or Author - Book (something)
  /^(?:(?<author>.+?)(?: - )+)(?<book>.+?)\W*(?:\(|\[)/gi,

  // Author - Book Year
  /^(?:(?<author>.+?)(?: - )+)(?<book>.+?)\W*(?<releaseyear>\d{4})/gi,

  // Author-Book (Year) Strict
  // Hyphen no space between author and book
  /^(?:(?<author>.+?)(?:-)+)(?<book>.+?)\W*(?:\(|\[).+?(?<releaseyear>\d{4})/gi,

  // Author-Book (Year)
  // Hyphen no space between author and book
  /^(?:(?<author>.+?)(?:-)+)(?<book>.+?)\W*(?:\(|\[)(?<releaseyear>\d{4})/gi,

  // Author-Book [something] or Author-Book (something)
  // Hyphen no space between author and book
  /^(?:(?<author>.+?)(?:-)+)(?<book>.+?)\W*(?:\(|\[)/gi,

  // Author-Book-something-Year
  /^(?:(?<author>.+?)(?:-)+)(?<book>.+?)(?:-.+?)(?<releaseyear>\d{4})/gi,

  // Author-Book Year
  // Hyphen no space between author and book
  /^(?:(?<author>.+?)(?:-)+)(?:(?<book>.+?)(?:-)+)(?<releaseyear>\d{4})/gi,

  // Author - Year - Book
  // Hypen with no or more spaces between author/book/year
  /^(?:(?<author>.+?)(?:-))(?<releaseyear>\d{4})(?:-)(?<book>[^-]+)/gi,
];

const REJECT_HASHED_RELEASES_REGEX: readonly RegExp[] = [
  // Generic match for md5 and mixed-case hashes.
  /^[0-9a-zA-Z]{32}/,

  // Generic match for shorter lower-case hashes.
  /^[a-z0-9]{24}$/,

  // Format seen on some NZBGeek releases
  // Be very strict with these coz they are very close to the valid 101 ep numbering.
  /^[A-Z]{11}\d{3}$/,
  /^[a-z]{12}\d{3}$/,

  // Backup filename (Unknown origins)
  /^Backup_\d{5,}S\d{2}-\d{2}$/,

  // 123 - Started appearing December 2014
  /^123$/,

  // abc - Started appearing January 2015
  /^abc$/i,

  // b00bs - Started appearing January 2015
  /^b00bs$/i,
];

/**
 * Ported from `Parser.cs`'s `NormalizeRegex`. C#'s `\W` (and `\b`) are
 * Unicode-category-aware by default -- `\W` matches anything that ISN'T a
 * Unicode letter/digit/connector-punctuation, so accented letters like "à"
 * are correctly treated as word characters and left alone. JS's `\W`/`\w`/
 * `\b` are ALWAYS ASCII-only (`[A-Za-z0-9_]`), even with the `u` flag --
 * there is no native JS regex flag that makes them Unicode-aware. Ported
 * here as `[^\p{L}\p{N}_]` (Unicode property escapes, `u` flag) in place of
 * the bare `\W`, which is the faithful equivalent of .NET's Unicode-aware
 * `\W` for this pattern's purpose (strip everything that isn't a letter,
 * digit, or underscore -- underscore is handled by the pattern's own
 * trailing `|_` alternative either way, kept for parity with the source).
 * `\b`/`(?<!^)`/`(?!$)` are left ASCII-only since they only ever bound the
 * literal ASCII common-word list (`a|an|the|and|or|of`) in this pattern --
 * not user-supplied Unicode text -- so no observable divergence there.
 */
const NORMALIZE_REGEX = new RegexReplace(
  "((?:\\b|_)(?<!^)(a(?!$)|an|the|and|or|of)(?!$)(?:\\b|_))|[^\\p{L}\\p{N}]|_",
  "",
  "iu"
);

const PERCENT_REGEX = /(?<=\b\d+)%/;

const FILE_EXTENSION_REGEX = /\.[a-z0-9]{2,4}$/i;

// TODO Rework this Regex for Music
const SIMPLE_TITLE_REGEX = new RegexReplace(
  "(?:(480|720|1080|2160|320)[ip]|[xh][\\W_]?26[45]|DD\\W?5\\W1|848x480|1280x720|1920x1080|3840x2160|4096x2160|(8|10)b(it)?)\\s*",
  "",
  "i"
);

// Valid TLDs http://data.iana.org/TLD/tlds-alpha-by-domain.txt
const WEBSITE_PREFIX_REGEX = new RegexReplace(
  "^(?:\\[\\s*)?(?:www\\.)?[-a-z0-9-]{1,256}\\.(?:[a-z]{2,6}\\.[a-z]{2,6}|xn--[a-z0-9-]{4,}|[a-z]{2,})\\b(?:\\s*\\]|[ -]{2,})[ -]*",
  "",
  "i"
);

const WEBSITE_POSTFIX_REGEX = new RegexReplace(
  "(?:\\[\\s*)?(?:www\\.)?[-a-z0-9-]{1,256}\\.(?:xn--[a-z0-9-]{4,}|[a-z]{2,6})\\b(?:\\s*\\])$",
  "",
  "i"
);

/**
 * Split from C#'s single `AirDateRegex` (see module doc comment above) --
 * tried in order, first match wins. Branch 1: YYYY.MM.DD / YYYY-MM-DD /
 * YYYY_MM_DD. Branch 2: MM.DD.YYYY / MM-DD-YYYY / MM_DD_YYYY.
 */
const AIR_DATE_REGEXES: readonly RegExp[] = [
  /^(.*?)(?<!\d)((?<airyear>\d{4})[_.-](?<airmonth>[0-1][0-9])[_.-](?<airday>[0-3][0-9]))(?!\d)/i,
  /^(.*?)(?<!\d)((?<airmonth>[0-1][0-9])[_.-](?<airday>[0-3][0-9])[_.-](?<airyear>\d{4}))(?!\d)/i,
];

const SIX_DIGIT_AIR_DATE_REGEX =
  /(?<=[_.-])(?<airdate>(?<!\d)(?<airyear>[1-9]\d{1})(?<airmonth>[0-1][0-9])(?<airday>[0-3][0-9]))(?=[_.-])/i;

const CLEAN_RELEASE_GROUP_REGEX = new RegexReplace(
  "^(.*?[-._ ])|(-(RP|1|NZBGeek|Obfuscated|Scrambled|sample|Pre|postbot|xpost|Rakuv[a-z0-9]*|WhiteRev|BUYMORE|AsRequested|AlternativeToRequested|GEROV|Z0iDS3N|Chamele0n|4P|4Planet))+$",
  "",
  "i"
);

const CLEAN_TORRENT_SUFFIX_REGEX = new RegexReplace("\\[(?:ettv|rartv|rarbg|cttv)\\]$", "", "i");

const RELEASE_GROUP_REGEX = /-(?<releasegroup>[a-z0-9]+)(?<!MP3|ALAC|FLAC|WEB)(?:\b|[-._ ])/gi;

const ANIME_RELEASE_GROUP_REGEX = /^(?:\[(?<subgroup>(?!\s).+?(?<!\s))\](?:_|-|\s|\.)?)/i;

const WORD_DELIMITERS: ReadonlySet<string> = new Set([
  " ",
  ".",
  ",",
  "_",
  "-",
  "=",
  "(",
  ")",
  "[",
  "]",
  "|",
  '"',
  "`",
  "'",
  "’",
]);
const WORD_DELIMITER_REGEX = /(\s|\.|,|_|-|=|\(|\)|\[|\]|\|)+/g;
/**
 * Ported from `Parser.cs`'s `PunctuationRegex` (`[^\w\s]`). Same
 * Unicode-awareness gap as `NORMALIZE_REGEX` above (.NET's `\w` matches
 * Unicode letters/digits, JS's is ASCII-only even with `u`) -- ported as
 * `[^\p{L}\p{N}_\s]` with the `u` flag so accented author/book titles
 * aren't corrupted by `normalizeTitle`/`normalizeTrackTitle`.
 */
const PUNCTUATION_REGEX = /[^\p{L}\p{N}_\s]/gu;
const COMMON_WORD_REGEX = /\b(a|an|the|and|or|of)\b\s?/gi;
const SPECIAL_EPISODE_WORD_REGEX = /\b(part|special|edition|christmas)\b\s?/gi;
const DUPLICATE_SPACES_REGEX = /\s{2,}/g;

const REQUEST_INFO_REGEX = /\[.+?\]/g;

const NUMBERS: readonly string[] = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

const COMMON_TAG_REGEX: readonly RegExp[] = [
  /(\[|\()*\b((featuring|feat\.|feat|ft|ft\.)\s{1}){1}\s*.*(\]|\))*/gi,
  /(?:\(|\[)(?:[^([]*)(?:version|limited|deluxe|single|clean|book|special|bonus|promo|remastered)(?:[^)\]]*)(?:\)|\])/gi,
];

const BRACKET_REGEX: readonly RegExp[] = [/\(.*\)/g, /\[.*\]/g];

const AFTER_DASH_REGEX = /[-:].*/;

// ---------------------------------------------------------------------------
// Public API (mirrors Parser.cs's public static surface)
// ---------------------------------------------------------------------------

/**
 * Ported from `Parser.ParseMusicPath(string path)`. Uses forward-slash
 * splitting rather than .NET's `FileInfo` -- see module doc comment.
 */
export function parseMusicPath(path: string): ParsedTrackInfo | null {
  const { dir, base } = splitPath(path);
  const ext = getExtension(base);

  let result = parseTitle(`${dir} ${base}`);

  if (result === null) {
    result = parseTitle(dir + ext);
  }

  return result;
}

/** Ported from `Parser.ParseTitle(string title)`. */
export function parseTitle(title: string): ParsedTrackInfo | null {
  try {
    if (!validateBeforeParsing(title)) {
      return null;
    }

    const releaseTitle = removeFileExtension(title);

    let simpleTitle = releaseTitle.replace(/【/g, "[").replace(/】/g, "]");

    simpleTitle = SIMPLE_TITLE_REGEX.replace(simpleTitle);

    // TODO: Quick fix stripping [url] - prefixes.
    simpleTitle = WEBSITE_PREFIX_REGEX.replace(simpleTitle);
    simpleTitle = WEBSITE_POSTFIX_REGEX.replace(simpleTitle);

    simpleTitle = CLEAN_TORRENT_SUFFIX_REGEX.replace(simpleTitle);

    simpleTitle = applyAirDateFixups(simpleTitle);

    for (const regex of REPORT_MUSIC_TITLE_REGEX) {
      const matches = matchAllReset(regex, simpleTitle);

      if (matches.length !== 0) {
        const result = parseMatchMusicCollection(matches);

        if (result !== null) {
          result.quality = parseQuality(title);
          return result;
        }
      }
    }
  } catch {
    // Ported from Parser.cs's catch-all: logs and continues (errors like
    // "password"/"yenc" titles are suppressed even from logging in C#).
    // No logger in this port (see monitorNewBookService.ts's doc comment
    // for why this codebase omits NLog) -- the exception is simply
    // swallowed, matching the observable behavior (returns null).
  }

  return null;
}

/** Ported from `Parser.ParseBookTitleWithSearchCriteria(string title, Author author, List<Book> books)`. */
export function parseBookTitleWithSearchCriteria(
  title: string,
  author: Author,
  books: Book[]
): ParsedBookInfo | null {
  try {
    if (!validateBeforeParsing(title)) {
      return null;
    }

    const authorName =
      author.metadata?.name === "Various Authors"
        ? "VA"
        : removeAccent(author.metadata?.name ?? "");

    const releaseTitle = removeFileExtension(title);

    let simpleTitle = SIMPLE_TITLE_REGEX.replace(releaseTitle);

    simpleTitle = WEBSITE_PREFIX_REGEX.replace(simpleTitle);
    simpleTitle = WEBSITE_POSTFIX_REGEX.replace(simpleTitle);

    simpleTitle = CLEAN_TORRENT_SUFFIX_REGEX.replace(simpleTitle);

    // Ported from `books.OrderByDescending(x => simpleTitle.FuzzyMatch(...,
    // wordDelimiters: WordDelimiters)).First()`: this is the Bitap-based
    // FuzzyMatch overload (FuzzyContains.cs), NOT the simple two-arg
    // Levenshtein-based FuzzyMatch (StringExtensions.cs) -- easy to
    // conflate since C# overloads on argument shape and both are named
    // "FuzzyMatch". Its 3-tuple return (location, length, score) is
    // `IComparable`/`IComparable<T>` as a `ValueTuple`, which C#'s default
    // comparer orders lexicographically by Item1 (location) first, then
    // Item2 (length), then Item3 (score) -- NOT by score alone. `.sort` here
    // is JS's native stable sort (Array.prototype.sort is guaranteed stable
    // since ES2019), matching `OrderByDescending`'s stability.
    const bestBook = [...books].sort((a, b) =>
      compareBitapTupleDescending(
        fuzzyMatch(simpleTitle, monitoredEditionTitle(a), 0.5, WORD_DELIMITERS as Set<string>),
        fuzzyMatch(simpleTitle, monitoredEditionTitle(b), 0.5, WORD_DELIMITERS as Set<string>)
      )
    )[0]!;

    const bestEditionTitle = monitoredEditionTitle(bestBook);

    let foundAuthor = getTitleFuzzy(simpleTitle, authorName);
    let remainder = foundAuthor.remainder;

    if (foundAuthor.found === null) {
      foundAuthor = getTitleFuzzy(simpleTitle, toLastFirstOrSelf(authorName));
      remainder = foundAuthor.remainder;
    }

    const foundBookResult = getTitleFuzzy(remainder, bestEditionTitle);
    let foundBook = foundBookResult.found;

    if (foundBook === null) {
      const [splitTitle] = splitBookTitle(bestEditionTitle, authorName);
      foundBook = getTitleFuzzy(remainder, splitTitle).found;
    }

    if (foundAuthor.found === null || foundBook === null) {
      return null;
    }

    const result = newParsedBookInfo();
    result.authorName = foundAuthor.found;
    result.authorTitleInfo = getAuthorTitleInfo(foundAuthor.found);
    result.bookTitle = foundBook;

    try {
      result.quality = parseQuality(title);
      result.releaseGroup = parseReleaseGroup(releaseTitle);
      return result;
    } catch {
      // InvalidDateException equivalent -- see parseBookTitle's matching catch for detail.
    }
  } catch {
    // Ported from Parser.cs's catch-all -- see parseTitle's doc comment.
  }

  return null;
}

function monitoredEditionTitle(book: Book): string {
  const edition = book.editions?.find((e) => e.monitored);
  return edition?.title ?? "";
}

/**
 * Ported from `ValueTuple<int,int,double>`'s default `IComparable`
 * ordering (lexicographic by Item1/location, then Item2/length, then
 * Item3/score), descending -- see `parseBookTitleWithSearchCriteria`'s
 * `bestBook` selection doc comment for why this specific comparator (not a
 * score-only one) is required for fidelity with `OrderByDescending`.
 */
function compareBitapTupleDescending(a: BitapMatch, b: BitapMatch): number {
  if (a.location !== b.location) {
    return b.location - a.location;
  }
  if (a.length !== b.length) {
    return b.length - a.length;
  }
  return b.score - a.score;
}

/** Ported from Parser.cs's `authorName.ToLastFirst()` call: falls back to the original name if ToLastFirst returns null (matching C#'s null-propagation there is never actually hit since `authorName` is never null at this call site, but preserved for fidelity). */
function toLastFirstOrSelf(name: string): string {
  return toLastFirst(name) ?? name;
}

/** Ported from `Parser.GetTitleFuzzy(string report, string name, out string remainder)`. */
export function getTitleFuzzy(
  report: string,
  name: string
): { found: string | null; remainder: string } {
  const {
    location: locStart,
    length: matchLength,
    score,
  } = fuzzyMatch(report.toLowerCase(), name.toLowerCase(), 0.6, WORD_DELIMITERS as Set<string>);

  if (locStart === -1) {
    return { found: null, remainder: report };
  }

  const found = report.substring(locStart, locStart + matchLength);

  if (score >= 0.8) {
    const remainder = report.substring(0, locStart) + report.substring(locStart + matchLength);
    return { found: found.replace(/\./g, " ").replace(/_/g, " "), remainder };
  }

  return { found: null, remainder: report };
}

/** Ported from `Parser.ParseBookTitle(string title)`. */
export function parseBookTitle(title: string): ParsedBookInfo | null {
  try {
    if (!validateBeforeParsing(title)) {
      return null;
    }

    const releaseTitle = removeFileExtension(title);

    let simpleTitle = SIMPLE_TITLE_REGEX.replace(releaseTitle);

    // TODO: Quick fix stripping [url] - prefixes.
    simpleTitle = WEBSITE_PREFIX_REGEX.replace(simpleTitle);
    simpleTitle = WEBSITE_POSTFIX_REGEX.replace(simpleTitle);

    simpleTitle = CLEAN_TORRENT_SUFFIX_REGEX.replace(simpleTitle);

    simpleTitle = applyAirDateFixups(simpleTitle);

    for (const regex of REPORT_BOOK_TITLE_REGEX) {
      const matches = matchAllReset(regex, simpleTitle);

      if (matches.length !== 0) {
        const result = parseBookMatchCollection(matches, releaseTitle);

        if (result !== null) {
          result.quality = parseQuality(title);

          result.releaseGroup = parseReleaseGroup(releaseTitle);

          const subGroup = getSubGroup(matches);
          if (subGroup.trim() !== "") {
            result.releaseGroup = subGroup;
          }

          result.releaseHash = getReleaseHash(matches);

          return result;
        }
      }
    }
  } catch {
    // Ported from Parser.cs's catch-all -- see parseTitle's doc comment.
  }

  return null;
}

/**
 * Ported from `Parser.SplitBookTitle(this string book, string author)`:
 * strips an "Author:" prefix, then splits on whichever of the first
 * parenthesis/colon comes first (an unbalanced/space-free parenthesis is
 * treated as not-a-split-point, exactly per the C# source's
 * `endParenthesis == -1 || !...Contains(' ')` check).
 */
export function splitBookTitle(bookTitle: string, author: string): [string, string] {
  let book = bookTitle;

  // Strip author from title, eg Tom Clancy: Ghost Protocol
  if (book.startsWith(`${author}:`)) {
    book = book.split(":").slice(1).join(":").trim();
  }

  let parenthesis = book.indexOf("(");
  const colon = book.indexOf(":");

  if (parenthesis > -1) {
    const endParenthesis = book.indexOf(")", parenthesis);
    if (
      endParenthesis === -1 ||
      !book.substring(parenthesis + 1, endParenthesis + 1).includes(" ")
    ) {
      parenthesis = -1;
    }
  }

  let parts: [string, string] | null = null;

  if (colon > -1 && parenthesis > -1) {
    if (colon < parenthesis) {
      parts = splitOnce(book, ":");
    } else {
      const idx = book.indexOf("(");
      parts = [book.substring(0, idx), trimEndChar(book.substring(idx + 1), ")")];
    }
  } else if (colon > -1) {
    parts = splitOnce(book, ":");
  } else if (parenthesis > -1) {
    const idx = book.indexOf("(");
    parts = [book.substring(0, idx), trimEndChar(book.substring(idx + 1), ")")];
  }

  if (parts !== null) {
    return [parts[0].trim(), trimEndChar(parts[1], ":").trim()];
  }

  return [book, ""];
}

function splitOnce(text: string, sep: string): [string, string] {
  const idx = text.indexOf(sep);
  return [text.substring(0, idx), text.substring(idx + 1)];
}

function trimEndChar(text: string, char: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === char) {
    end--;
  }
  return text.substring(0, end);
}

/** Ported from `Parser.CleanAuthorName(this string name)`. */
export function cleanAuthorName(name: string | null | undefined): string {
  if (name === null || name === undefined || name.trim() === "") {
    return "";
  }

  // If Title only contains numbers return it as is. Ported from
  // `long.TryParse(name, out _)`: .NET's default NumberStyles.Integer
  // allows leading/trailing whitespace and an optional leading sign, which
  // is why this checks `name` itself (not a pre-trimmed copy) against a
  // sign-and-whitespace-tolerant pattern rather than a bare `\d+`.
  if (/^\s*[-+]?\d+\s*$/.test(name)) {
    return name;
  }

  const percentReplaced = name.replace(PERCENT_REGEX, "percent");

  return removeAccent(NORMALIZE_REGEX.replace(percentReplaced).toLowerCase());
}

/** Ported from `Parser.NormalizeTrackTitle(this string title)`. */
export function normalizeTrackTitle(title: string): string {
  let result = title.replace(SPECIAL_EPISODE_WORD_REGEX, "");
  result = result.replace(PUNCTUATION_REGEX, " ");
  result = result.replace(DUPLICATE_SPACES_REGEX, " ");

  return result.trim().toLowerCase();
}

/** Ported from `Parser.NormalizeTitle(string title)`. */
export function normalizeTitle(title: string): string {
  let result = title.replace(WORD_DELIMITER_REGEX, " ");
  result = result.replace(PUNCTUATION_REGEX, "");
  result = result.replace(COMMON_WORD_REGEX, "");
  result = result.replace(DUPLICATE_SPACES_REGEX, " ");

  return result.trim().toLowerCase();
}

/** Ported from `Parser.ParseReleaseGroup(string title)`. */
export function parseReleaseGroup(titleInput: string): string | null {
  let title = titleInput.trim();
  title = removeFileExtension(title);
  title = WEBSITE_PREFIX_REGEX.replace(title);

  const animeMatch = ANIME_RELEASE_GROUP_REGEX.exec(title);

  if (animeMatch?.groups) {
    return animeMatch.groups.subgroup ?? null;
  }

  title = CLEAN_RELEASE_GROUP_REGEX.replace(title);

  const matches = matchAllReset(RELEASE_GROUP_REGEX, title);

  if (matches.length !== 0) {
    const group = matches[matches.length - 1]!.groups?.releasegroup ?? "";

    // Ported from `int.TryParse(group, out _)`. `group` is regex-constrained
    // to `[a-z0-9]+` (see RELEASE_GROUP_REGEX above), so it can never
    // contain a sign or whitespace -- a bare all-digits check is sufficient
    // (unlike CleanAuthorName's `long.TryParse`, no sign/whitespace
    // tolerance is needed here).
    if (/^\d+$/.test(group)) {
      return null;
    }

    return group;
  }

  return null;
}

/** Ported from `Parser.RemoveFileExtension(string title)`. */
export function removeFileExtension(title: string): string {
  return title.replace(FILE_EXTENSION_REGEX, (matched) => {
    const extension = matched.toLowerCase();
    if (
      MediaFileExtensions.AllExtensions.has(extension) ||
      extension === ".par2" ||
      extension === ".nzb"
    ) {
      return "";
    }

    return matched;
  });
}

/** Ported from `Parser.CleanBookTitle(this string book)`. */
export function cleanBookTitle(book: string): string {
  return COMMON_TAG_REGEX[1]!.exec(book)
    ? book.replace(COMMON_TAG_REGEX[1]!, "").trim()
    : book.trim();
}

/** Ported from `Parser.RemoveBracketsAndContents(this string book)`. */
export function removeBracketsAndContents(book: string): string {
  let intermediate = book;
  for (const regex of BRACKET_REGEX) {
    intermediate = intermediate.replace(regex, "").trim();
  }

  return intermediate;
}

/** Ported from `Parser.RemoveAfterDash(this string text)`. */
export function removeAfterDash(text: string): string {
  return text.replace(AFTER_DASH_REGEX, "").trim();
}

/** Ported from `Parser.CleanTrackTitle(this string title)`. */
export function cleanTrackTitle(title: string): string {
  let intermediateTitle = title;
  for (const regex of COMMON_TAG_REGEX) {
    intermediateTitle = intermediateTitle.replace(regex, "").trim();
  }

  return intermediateTitle;
}

function parseMatchMusicCollection(matches: RegExpMatchArray[]): ParsedTrackInfo | null {
  let authorName = (matches[0]!.groups?.author ?? "").replace(/_/g, " ");
  authorName = authorName.replace(REQUEST_INFO_REGEX, "").trim();

  // Ported from Radarr (https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/Parser/Parser.cs)
  // TODO: Split into separate method and write unit tests for.
  const parts = authorName.split(".");
  let built = "";
  let n = 0;
  let previousAcronym = false;
  let nextPart = "";

  for (const part of parts) {
    if (parts.length >= n + 2) {
      nextPart = parts[n + 1]!;
    }

    // Ported faithfully INCLUDING a genuine C# quirk: `int.TryParse(part,
    // out n)` writes its parsed value into `n` -- the SAME variable used as
    // the loop position counter for `nextPart` lookups above -- as a side
    // effect of evaluating this condition. Because `&&` short-circuits,
    // `TryParse` (and thus this clobbering) only happens when
    // `part.Length == 1 && part.ToLower() != "a"` are both already true.
    // When it fires, `n` gets overwritten with the parsed int (or left at
    // its printevious value if parsing fails) right before the `n++` at the
    // bottom of the loop body (parse failure leaves `n` at its previous
    // value, same as C#'s `out n` semantics on a failed TryParse), silently
    // corrupting the position counter for every subsequent iteration. This
    // is exactly the kind of "known-buggy edge case" this port is
    // instructed to preserve, not fix.
    let tryParseSucceeded = false;
    if (part.length === 1 && part.toLowerCase() !== "a") {
      const parsed = tryParseInt(part);
      tryParseSucceeded = parsed !== null;
      if (parsed !== null) {
        n = parsed;
      }
    }

    if (part.length === 1 && part.toLowerCase() !== "a" && !tryParseSucceeded) {
      built += part + ".";
      previousAcronym = true;
    } else if (part.toLowerCase() === "a" && (previousAcronym === true || nextPart.length === 1)) {
      built += part + ".";
      previousAcronym = true;
    } else {
      if (previousAcronym) {
        built += " ";
        previousAcronym = false;
      }

      built += part + " ";
    }

    n++;
  }

  authorName = built.trim();

  const result = newParsedTrackInfo();
  result.authors = [authorName];

  return result;
}

function getAuthorTitleInfo(title: string): AuthorTitleInfo {
  return {
    title,
    titleWithoutYear: "",
    year: 0,
  };
}

/** Ported from `Parser.ParseAuthorName(string title)`. */
export function parseAuthorName(title: string): string {
  const parseResult = parseBookTitle(title);

  if (parseResult === null) {
    return cleanAuthorName(title);
  }

  return parseResult.authorName;
}

function parseBookMatchCollection(
  matches: RegExpMatchArray[],
  releaseTitle: string
): ParsedBookInfo | null {
  const groups = matches[0]!.groups ?? {};

  let authorName = (groups.author ?? "").replace(/\./g, " ").replace(/_/g, " ");
  let bookTitle = (groups.book ?? "").replace(/\./g, " ").replace(/_/g, " ");
  let releaseVersion = (groups.version ?? "").replace(/\./g, " ").replace(/_/g, " ");
  authorName = authorName.replace(REQUEST_INFO_REGEX, "").trim();
  bookTitle = bookTitle.replace(REQUEST_INFO_REGEX, "").trim();
  releaseVersion = releaseVersion.replace(REQUEST_INFO_REGEX, "").trim();

  const releaseYear = parseIntOrZero(groups.releaseyear);

  const result = newParsedBookInfo();
  result.releaseTitle = releaseTitle;
  result.authorName = authorName;
  result.bookTitle = bookTitle;
  result.authorTitleInfo = getAuthorTitleInfo(result.authorName);
  result.releaseDate = String(releaseYear);
  result.releaseVersion = releaseVersion;

  if (groups.discography !== undefined) {
    const discStart = parseIntOrZero(groups.startyear);
    const discEnd = parseIntOrZero(groups.endyear);
    result.discography = true;

    if (discStart > 0 && discEnd > 0) {
      result.discographyStart = discStart;
      result.discographyEnd = discEnd;
    } else if (discEnd > 0) {
      result.discographyEnd = discEnd;
    }

    result.bookTitle = "Discography";
  }

  return result;
}

function parseIntOrZero(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Ported from `int.TryParse(string, out int)`'s success case: returns the
 * parsed integer, or `null` on failure (mirrors the `out` parameter's
 * "unchanged on failure" contract at call sites -- see
 * `parseMatchMusicCollection`'s `n`-clobbering quirk above, which relies on
 * `null` meaning "leave the existing value alone"). .NET's default
 * `int.TryParse` allows leading/trailing whitespace and an optional sign,
 * rejects decimals/exponents -- `Number.parseInt` alone is too lenient
 * (accepts trailing garbage like `"5abc"` -> 5), so this validates the full
 * string against an equivalent pattern first.
 */
function tryParseInt(value: string): number | null {
  if (!/^\s*[-+]?\d+\s*$/.test(value)) {
    return null;
  }
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function validateBeforeParsing(title: string): boolean {
  const lower = title.toLowerCase();
  if (lower.includes("password") && lower.includes("yenc")) {
    return false;
  }

  if (!/[a-zA-Z0-9]/.test(title)) {
    return false;
  }

  const titleWithoutExtension = removeFileExtension(title);

  if (REJECT_HASHED_RELEASES_REGEX.some((v) => v.test(titleWithoutExtension))) {
    return false;
  }

  return true;
}

function getSubGroup(matches: RegExpMatchArray[]): string {
  return matches[0]!.groups?.subgroup ?? "";
}

function getReleaseHash(matches: RegExpMatchArray[]): string {
  const hash = matches[0]!.groups?.hash;

  if (hash !== undefined) {
    const hashValue = hash.replace(/^[[\]]+|[[\]]+$/g, "");

    if (hashValue === "1280x720") {
      return "";
    }

    return hashValue;
  }

  return "";
}

/** Ported from `Parser.ParseNumber(string value)`. Not exposed publicly in the C# source's public surface, kept for parity/future use. */
export function parseNumber(value: string): number {
  const asInt = Number.parseInt(value, 10);
  if (!Number.isNaN(asInt) && String(asInt) === value.trim()) {
    return asInt;
  }

  const number = NUMBERS.indexOf(value.toLowerCase());

  if (number !== -1) {
    return number;
  }

  throw new Error(`${value} isn't a number`);
}

// ---------------------------------------------------------------------------
// Small helpers (RemoveAccent, path splitting, air-date fixups, regex match-all)
// ---------------------------------------------------------------------------

/**
 * Ported from `NzbDrone.Common.Extensions.StringExtensions.RemoveAccent`:
 * NFD-normalize then strip combining marks (Unicode category Mn), which is
 * the standard JS equivalent of .NET's per-character
 * `UnicodeCategory.NonSpacingMark` filter.
 */
function removeAccent(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

function splitPath(path: string): { dir: string; base: string } {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) {
    return { dir: "", base: normalized };
  }
  return { dir: normalized.substring(0, idx), base: normalized.substring(idx + 1) };
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.substring(idx);
}

/**
 * Ported from the repeated `AirDateRegex`/`SixDigitAirDateRegex` fixup block
 * shared by `ParseTitle` and `ParseBookTitle`.
 */
function applyAirDateFixups(input: string): string {
  let simpleTitle = input;

  for (const regex of AIR_DATE_REGEXES) {
    const airDateMatch = regex.exec(simpleTitle);
    if (airDateMatch?.groups) {
      const prefix = airDateMatch[1] ?? "";
      simpleTitle = `${prefix}${airDateMatch.groups.airyear}.${airDateMatch.groups.airmonth}.${airDateMatch.groups.airday}`;
      break;
    }
  }

  const sixDigitMatch = SIX_DIGIT_AIR_DATE_REGEX.exec(simpleTitle);
  if (sixDigitMatch?.groups) {
    const airYear = sixDigitMatch.groups.airyear!;
    const airMonth = sixDigitMatch.groups.airmonth!;
    const airDay = sixDigitMatch.groups.airday!;

    if (airMonth !== "00" || airDay !== "00") {
      const fixedDate = `20${airYear}.${airMonth}.${airDay}`;
      simpleTitle = simpleTitle.replace(sixDigitMatch.groups.airdate!, fixedDate);
    }
  }

  return simpleTitle;
}

/**
 * Ported from C#'s `Regex.Matches(string)` -> `MatchCollection`: returns
 * every non-overlapping match. C# `Regex.Matches` doesn't require the
 * `global` flag (it always returns all matches); every regex above that's
 * used with `matchAllReset` is declared with the `g` flag specifically so
 * `matchAll`/`exec`-in-a-loop semantics work, and `lastIndex` is reset
 * afterward so the same compiled `RegExp` object is safe to reuse across
 * calls (JS regexes with `g` are stateful).
 */
function matchAllReset(regex: RegExp, input: string): RegExpMatchArray[] {
  regex.lastIndex = 0;
  const matches = Array.from(input.matchAll(regex));
  regex.lastIndex = 0;
  return matches;
}
