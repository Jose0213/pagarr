import type { Author, Edition } from "../../books/models.js";
import type { CustomFormat } from "../../custom-formats/customFormat.js";
import { splitBookTitle } from "../../parser/parser.js";
import { formatAudioCodec, formatAudioSampleRate } from "./mediaInfoFormatter.js";
import { newBasicNamingConfig, type BasicNamingConfig } from "./namingConfig.js";
import { ColonReplacementFormat, type NamingConfig } from "./namingConfig.js";
import { NamingFormatException } from "./errors.js";
import { TokenMap } from "./fileNameBuilderTokenEqualityComparer.js";

/**
 * Ported from NzbDrone.Core/Organizer/FileNameBuilder.cs. This is Readarr's
 * naming-template engine -- it renders tokens like `{Author Name}`/
 * `{Book Title}`/`{Quality Title}` against an Author/Edition/BookFile into
 * a final file name or author-folder name. Per this module's task brief
 * (known-issue #5, filesystem permission friction) this is ported as
 * precisely as possible: it is the piece every later file-move/rename
 * operation depends on, and any naming-engine bug shows up as a
 * mis-organized (or permission-tripping, e.g. an illegal path character
 * that later fails to `mkdir`/`rename`) file path downstream.
 *
 * ## Forward-references (this module cannot import from sibling worktrees)
 *
 * - `BookFile` (real owner: `media-files-import`, `NzbDrone.Core/MediaFiles/
 *   BookFile.cs`) -- declared locally below as `BookFileLike`, matching the
 *   exact fields `FileNameBuilder`/`MediaInfoFormatter` read off a real
 *   `BookFile`: `path`, `sceneName`, `releaseGroup`, `quality`, `mediaInfo`,
 *   `part`, `partCount`. `AddCustomFormats` also mutates `bookFile.Author =
 *   author` in the C# source right before calling
 *   `_formatCalculator.ParseCustomFormat(bookFile, author)` -- ported here as
 *   passing `author` as an explicit second argument to
 *   `customFormatCalculationService.parseCustomFormatForBookFile(bookFile,
 *   author)` instead (see custom-formats/customFormatCalculationService.ts,
 *   which already takes `author` as an explicit parameter rather than
 *   reading a mutated `BookFile.Author` -- no local mutation needed).
 * - `IQualityDefinitionService`/`ICustomFormatCalculationService` -- these
 *   ARE real, merged Phase 1/Phase 2 modules (`qualities/
 *   qualityDefinitionService.ts`, `custom-formats/
 *   customFormatCalculationService.ts`) and are imported directly, not
 *   forward-referenced.
 *
 * ## Deviations from the C# source (mechanical, not behavioral)
 *
 * - No `ICacheManager`/`ICached<BookFormat[]>` cache for `GetTrackFormat`:
 *   `GetBasicNamingConfig` is a rarely-called UI-preview helper (not on the
 *   file-rename hot path), and `GetTrackFormat` is cheap (`.Matches()` over
 *   a short pattern string) -- the cache was a C#-side micro-optimization,
 *   not observable behavior. Ported as a direct (uncached) call.
 * - No NLog `Logger`: the one log call (`_logger.Trace("Media info is
 *   unavailable for {0}", bookFile)` in `AddMediaInfoTokens`) is omitted,
 *   matching this port's established "Instrumentation isn't ported yet,
 *   nothing needs it to behave correctly" convention (see configService.ts).
 */

export interface BookFileLike {
  path: string;
  sceneName: string | null;
  releaseGroup: string | null;
  quality: { quality: { id: number } };
  mediaInfo: {
    audioFormat: string | null;
    audioBitrate: number;
    audioChannels: number;
    audioBits: number;
    audioSampleRate: number;
  } | null;
  part: number;
  partCount: number;
}

/** Minimal forward-ref for the slice of QualityDefinitionService FileNameBuilder calls. */
export interface QualityDefinitionServiceLike {
  get(quality: { id: number }): { title: string };
}

/** Minimal forward-ref for the slice of CustomFormatCalculationService FileNameBuilder calls. */
export interface CustomFormatCalculationServiceLike {
  parseCustomFormatForBookFile(bookFile: BookFileLike, author: Author): CustomFormat[];
}

export interface INamingConfigServiceLike {
  getConfig(): NamingConfig;
}

/** Ported from `TokenMatch` (internal sealed class). */
interface TokenMatch {
  prefix: string;
  separator: string;
  suffix: string;
  token: string;
  customFormat: string | null;
}

/** Ported from `TokenMatch.DefaultValue(string defaultValue)`. */
function tokenDefaultValue(
  match: Pick<TokenMatch, "prefix" | "suffix">,
  defaultValue: string
): string {
  return isBlank(match.prefix) && isBlank(match.suffix) ? defaultValue : "";
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === "";
}

type TokenHandler = (match: TokenMatch) => string;

/** Ported from `ReplacePartToken`'s `new TokenMatch { CustomFormat = ... }` construction -- every other field left at its C# default (null/empty string). */
function partTokenMatch(customFormat: string | undefined): TokenMatch {
  return {
    prefix: "",
    separator: "",
    suffix: "",
    token: "",
    customFormat: customFormat ?? null,
  };
}

/**
 * Ported from `FileNameBuilder.TitleRegex`. Matches a single `{...}` token:
 * an optional prefix (punctuation/brackets), the token name itself
 * (word-separator-word, e.g. "Author Name"), an optional `:customFormat`
 * suffix, and a trailing punctuation suffix.
 */
const TITLE_REGEX =
  /\{(?<prefix>[- ._[(]*)(?<token>(?:[a-z0-9]+)(?:(?<separator>[- ._]+)(?:[a-z0-9]+))?)(?::(?<customFormat>[a-z0-9]+))?(?<suffix>[- ._)\]]*)\}/gi;

/**
 * Ported from `FileNameBuilder.PartRegex`. Matches a `{...}` token
 * containing one or two of PartNumber/PartCount (e.g.
 * `{(PartNumber)}`, `{(ptPartNumber:00 of PartCount:00)}`). Exported (C#'s
 * is `public static readonly`) since `FileNameValidation.
 * ValidStandardTrackFormatValidator` matches against it too.
 */
export const PART_REGEX =
  /\{(?<prefix>[^{]*?)(?<token1>PartNumber|PartCount)(?::(?<customFormat1>[a-z0-9]+))?(?<separator>.*(?=PartNumber|PartCount))?((?<token2>PartNumber|PartCount)(?::(?<customFormat2>[a-z0-9]+))?)?(?<suffix>[^}]*)\}/gi;

/** Ported from `FileNameBuilder.AuthorNameRegex`. Used by FileNameValidation (ported in the same module) to require an author token in AuthorFolderFormat. */
export const AUTHOR_NAME_REGEX =
  /(?<token>\{(?:Author)(?<separator>[- ._])(Clean)?(Sort)?Name(The)?\})/gi;

/** Ported from `FileNameBuilder.BookTitleRegex`. Used by FileNameValidation. */
export const BOOK_TITLE_REGEX =
  /(?<token>\{(?:Book)(?<separator>[- ._])(Clean)?Title(The)?(NoSub)?\})/gi;

const FILE_NAME_CLEANUP_REGEX = /([- ._])(\1)+/g;
const TRIM_SEPARATORS_REGEX = /[- ._]$/;

/**
 * Ported from `FileNameBuilder.ScenifyRemoveChars`/`ScenifyReplaceChars`.
 * JS's `RegExp` doesn't need the `{1}` C# used after the first alternative
 * (a single-character class match is already exactly one character); kept
 * semantically identical without it.
 */
const SCENIFY_REMOVE_CHARS =
  /(?<=\s)(,|<|>|\/|\\|;|:|'|"|\||`|~|!|\?|@|\$|%|\^|\*|-|_|=)(?=\s)|('|:|\?|,)(?=(?:(?:s|m)\s)|\s|$)|(\(|\)|\[|\]|\{|\})/gi;
const SCENIFY_REPLACE_CHARS = /[/]/gi;

const TITLE_PREFIX_REGEX = /^(The|An|A) (.*?)((?: *\([^)]+\))*)$/i;

export class FileNameBuilder {
  constructor(
    private readonly namingConfigService: INamingConfigServiceLike,
    private readonly qualityDefinitionService: QualityDefinitionServiceLike,
    private readonly formatCalculator: CustomFormatCalculationServiceLike
  ) {}

  buildBookFileName(
    author: Author,
    edition: Edition,
    bookFile: BookFileLike,
    namingConfig?: NamingConfig,
    customFormats?: CustomFormat[]
  ): string {
    const config = namingConfig ?? this.namingConfigService.getConfig();

    if (!config.renameBooks) {
      return getOriginalFileName(bookFile);
    }

    if (isBlankOrWhitespace(config.standardBookFormat)) {
      throw new NamingFormatException("File name format cannot be empty");
    }

    const pattern = config.standardBookFormat;

    const tokenHandlers = new TokenMap<TokenHandler>();

    this.addAuthorTokens(tokenHandlers, author);
    this.addBookTokens(tokenHandlers, edition);
    this.addBookFileTokens(tokenHandlers, bookFile);
    this.addQualityTokens(tokenHandlers, bookFile);
    this.addMediaInfoTokens(tokenHandlers, bookFile);
    this.addCustomFormats(tokenHandlers, author, bookFile, customFormats);

    const splitPatterns = pattern.split(/[\\/]/).filter((s) => s.length > 0);
    const components: string[] = [];

    for (const splitPattern of splitPatterns) {
      let component = this.replacePartTokens(splitPattern, tokenHandlers).trim();
      component = this.replaceTokens(component, tokenHandlers, config).trim();

      component = component.replace(FILE_NAME_CLEANUP_REGEX, (m) => m[0] ?? "");
      component = component.replace(TRIM_SEPARATORS_REGEX, "");

      if (isNotBlankOrWhitespace(component)) {
        components.push(component);
      }
    }

    return components.join("/");
  }

  buildBookFilePath(author: Author, edition: Edition, fileName: string, extension: string): string {
    if (isBlank(extension)) {
      throw new Error("extension must not be null or whitespace");
    }

    const path = this.buildBookPath(author);

    return joinPath(path, fileName + extension);
  }

  buildBookPath(author: Author): string {
    return author.path;
  }

  /**
   * Ported from `GetBasicNamingConfig`. Note the C# original's
   * `GetTrackFormat(...).LastOrDefault()` call resolves via
   * `SeasonEpisodePatternRegex` (a `{season}...{episode}` TV-naming pattern
   * -- see types.ts's doc comment on why `BookFormat` is otherwise unused
   * dead code) against `StandardBookFormat`; since Readarr's book naming
   * patterns never contain `{season}`/`{episode}` tokens, this always
   * returns undefined/null for a real book naming pattern, so this method
   * always returns the "no track format" branch (`new BasicNamingConfig()`)
   * in practice for any realistic input -- reproduced faithfully.
   */
  getBasicNamingConfig(nameSpec: NamingConfig): BasicNamingConfig {
    const trackFormat = getTrackFormat(nameSpec.standardBookFormat).at(-1);

    if (!trackFormat) {
      return newBasicNamingConfig();
    }

    const basicNamingConfig = newBasicNamingConfig();
    basicNamingConfig.separator = trackFormat.separator;

    const titleTokens = [...nameSpec.standardBookFormat.matchAll(new RegExp(TITLE_REGEX))];

    for (const match of titleTokens) {
      const separator = match.groups?.["separator"] ?? "";
      const token = match.groups?.["token"] ?? "";

      if (separator !== " ") {
        basicNamingConfig.replaceSpaces = true;
      }

      if (token.toLowerCase().startsWith("{author")) {
        basicNamingConfig.includeAuthorName = true;
      }

      if (token.toLowerCase().startsWith("{book")) {
        basicNamingConfig.includeBookTitle = true;
      }

      if (token.toLowerCase().startsWith("{quality")) {
        basicNamingConfig.includeQuality = true;
      }
    }

    return basicNamingConfig;
  }

  getAuthorFolder(author: Author, namingConfig?: NamingConfig): string {
    const config = namingConfig ?? this.namingConfigService.getConfig();

    const pattern = config.authorFolderFormat;
    const tokenHandlers = new TokenMap<TokenHandler>();

    this.addAuthorTokens(tokenHandlers, author);

    const splitPatterns = pattern.split(/[\\/]/).filter((s) => s.length > 0);
    const components: string[] = [];

    for (const splitPattern of splitPatterns) {
      let component = this.replaceTokens(splitPattern, tokenHandlers, config);
      component = cleanFolderName(component);

      if (isNotBlankOrWhitespace(component)) {
        components.push(component);
      }
    }

    return components.join("/");
  }

  private addAuthorTokens(tokenHandlers: TokenMap<TokenHandler>, author: Author): void {
    tokenHandlers.set("{Author Name}", () =>
      author.cleanName !== undefined ? authorDisplayName(author) : authorDisplayName(author)
    );
    tokenHandlers.set("{Author CleanName}", () => cleanTitle(authorDisplayName(author)));
    tokenHandlers.set("{Author NameThe}", () => titleThe(authorDisplayName(author)));
    tokenHandlers.set("{Author SortName}", () => author.metadata?.nameLastFirst ?? "");
    tokenHandlers.set("{Author NameFirstCharacter}", () =>
      firstCharToUpper(titleThe(authorDisplayName(author)).substring(0, 1))
    );

    if (author.metadata?.disambiguation !== null && author.metadata?.disambiguation !== undefined) {
      const disambiguation = author.metadata.disambiguation;
      tokenHandlers.set("{Author Disambiguation}", () => disambiguation);
    }
  }

  private addBookTokens(tokenHandlers: TokenMap<TokenHandler>, edition: Edition): void {
    tokenHandlers.set("{Book Title}", () => edition.title);
    tokenHandlers.set("{Book CleanTitle}", () => cleanTitle(edition.title));
    tokenHandlers.set("{Book TitleThe}", () => titleThe(edition.title));

    const book = edition.book;
    const authorName = book?.authorMetadata?.name ?? "";
    const [titleNoSub, subtitle] = splitBookTitle(edition.title, authorName);

    tokenHandlers.set("{Book TitleNoSub}", () => titleNoSub);
    tokenHandlers.set("{Book CleanTitleNoSub}", () => cleanTitle(titleNoSub));
    tokenHandlers.set("{Book TitleTheNoSub}", () => titleThe(titleNoSub));

    tokenHandlers.set("{Book Subtitle}", () => subtitle);
    tokenHandlers.set("{Book CleanSubtitle}", () => cleanTitle(subtitle));
    tokenHandlers.set("{Book SubtitleThe}", () => titleThe(subtitle));

    const seriesLinks = book?.seriesLinks ?? [];
    if (seriesLinks.length > 0) {
      const primarySeries = [...seriesLinks].sort(
        (a, b) => a.seriesPosition - b.seriesPosition
      )[0]!;
      const seriesTitle =
        (primarySeries.series?.title ?? "") +
        (isNotBlankOrWhitespace(primarySeries.position) ? ` #${primarySeries.position}` : "");

      tokenHandlers.set("{Book Series}", () => primarySeries.series?.title ?? "");
      tokenHandlers.set("{Book SeriesPosition}", () => primarySeries.position ?? "");
      tokenHandlers.set("{Book SeriesTitle}", () => seriesTitle);
    }

    if (edition.disambiguation !== null && edition.disambiguation !== undefined) {
      const disambiguation = edition.disambiguation;
      tokenHandlers.set("{Book Disambiguation}", () => disambiguation);
    }

    if (edition.releaseDate !== null && edition.releaseDate !== undefined) {
      const year = new Date(edition.releaseDate).getUTCFullYear();
      tokenHandlers.set("{Release Year}", () => String(year));
    } else if (book?.releaseDate !== null && book?.releaseDate !== undefined) {
      const year = new Date(book.releaseDate).getUTCFullYear();
      tokenHandlers.set("{Release Year}", () => String(year));
    } else {
      tokenHandlers.set("{Release Year}", () => "Unknown");
    }

    if (edition.releaseDate !== null && edition.releaseDate !== undefined) {
      const year = new Date(edition.releaseDate).getUTCFullYear();
      tokenHandlers.set("{Edition Year}", () => String(year));
    } else {
      tokenHandlers.set("{Edition Year}", () => "Unknown");
    }

    if (book?.releaseDate !== null && book?.releaseDate !== undefined) {
      const year = new Date(book.releaseDate).getUTCFullYear();
      tokenHandlers.set("{Release YearFirst}", () => String(year));
    } else {
      tokenHandlers.set("{Release YearFirst}", () => "Unknown");
    }
  }

  private addBookFileTokens(tokenHandlers: TokenMap<TokenHandler>, bookFile: BookFileLike): void {
    tokenHandlers.set("{Original Title}", () => getOriginalTitle(bookFile));
    tokenHandlers.set("{Original Filename}", () => getOriginalFileName(bookFile));
    tokenHandlers.set(
      "{Release Group}",
      (m) => bookFile.releaseGroup ?? tokenDefaultValue(m, "Readarr")
    );

    if (bookFile.partCount > 1) {
      tokenHandlers.set("{PartNumber}", (m) => formatNumber(bookFile.part, m.customFormat));
      tokenHandlers.set("{PartCount}", (m) => formatNumber(bookFile.partCount, m.customFormat));
    }
  }

  private addQualityTokens(tokenHandlers: TokenMap<TokenHandler>, bookFile: BookFileLike): void {
    const qualityTitle = this.qualityDefinitionService.get(bookFile.quality.quality).title;
    const qualityProper = getQualityProper(bookFile);

    tokenHandlers.set("{Quality Full}", () => qualityTitle);
    tokenHandlers.set("{Quality Title}", () => qualityTitle);
    tokenHandlers.set("{Quality Proper}", () => qualityProper);
  }

  private addMediaInfoTokens(tokenHandlers: TokenMap<TokenHandler>, bookFile: BookFileLike): void {
    if (bookFile.mediaInfo === null) {
      return;
    }

    const mediaInfo = bookFile.mediaInfo;
    const audioCodec = formatAudioCodec(mediaInfo);
    const audioChannels = mediaInfo.audioChannels;
    const audioChannelsFormatted = audioChannels > 0 ? audioChannels.toFixed(1) : "";

    tokenHandlers.set("{MediaInfo AudioCodec}", () => audioCodec);
    tokenHandlers.set("{MediaInfo AudioChannels}", () => audioChannelsFormatted);
    tokenHandlers.set("{MediaInfo AudioBitRate}", () => `${mediaInfo.audioBitrate} kbps`);
    tokenHandlers.set("{MediaInfo AudioBitsPerSample}", () =>
      mediaInfo.audioBits === 0 ? "" : `${mediaInfo.audioBits}bit`
    );
    tokenHandlers.set("{MediaInfo AudioSampleRate}", () => formatAudioSampleRate(mediaInfo));
  }

  private addCustomFormats(
    tokenHandlers: TokenMap<TokenHandler>,
    author: Author,
    bookFile: BookFileLike,
    customFormats?: CustomFormat[]
  ): void {
    const formats =
      customFormats ?? this.formatCalculator.parseCustomFormatForBookFile(bookFile, author);

    tokenHandlers.set("{Custom Formats}", () =>
      formats
        .filter((f) => f.includeCustomFormatWhenRenaming)
        .map((f) => f.name)
        .join(" ")
    );
  }

  private replaceTokens(
    pattern: string,
    tokenHandlers: TokenMap<TokenHandler>,
    namingConfig: NamingConfig
  ): string {
    return pattern.replace(new RegExp(TITLE_REGEX), (...args) => {
      const match = args[args.length - 1] as Record<string, string | undefined>;
      return this.replaceToken(match, tokenHandlers, namingConfig);
    });
  }

  private replaceToken(
    groups: Record<string, string | undefined>,
    tokenHandlers: TokenMap<TokenHandler>,
    namingConfig: NamingConfig
  ): string {
    const tokenMatch: TokenMatch = {
      prefix: groups["prefix"] ?? "",
      separator: groups["separator"] ?? "",
      suffix: groups["suffix"] ?? "",
      token: `{${groups["token"] ?? ""}}`,
      customFormat: isBlank(groups["customFormat"]) ? null : (groups["customFormat"] ?? null),
    };

    const tokenHandler = tokenHandlers.getOrDefault(tokenMatch.token, () => "");

    let replacementText = tokenHandler(tokenMatch).trim();

    if ([...tokenMatch.token].every((t) => !isLetter(t) || t === t.toLowerCase())) {
      replacementText = replacementText.toLowerCase();
    } else if ([...tokenMatch.token].every((t) => !isLetter(t) || t === t.toUpperCase())) {
      replacementText = replacementText.toUpperCase();
    }

    if (isNotBlankOrWhitespace(tokenMatch.separator)) {
      replacementText = replacementText.split(" ").join(tokenMatch.separator);
    }

    replacementText = cleanFileName(replacementText, namingConfig);

    if (isNotBlankOrWhitespace(replacementText)) {
      replacementText = tokenMatch.prefix + replacementText + tokenMatch.suffix;
    }

    return replacementText;
  }

  /** Ported from `ReplacePartTokens` -- note the C# original ignores `namingConfig` too (only `ReplaceTokens` needs it, for `CleanFileName`); the part-token path never runs its output through CleanFileName here either, matching that. */
  private replacePartTokens(pattern: string, tokenHandlers: TokenMap<TokenHandler>): string {
    return pattern.replace(new RegExp(PART_REGEX), (...args) => {
      const match = args[args.length - 1] as Record<string, string | undefined>;
      return this.replacePartToken(match, tokenHandlers);
    });
  }

  private replacePartToken(
    groups: Record<string, string | undefined>,
    tokenHandlers: TokenMap<TokenHandler>
  ): string {
    const token1 = groups["token1"] ?? "";
    let tokenHandler = tokenHandlers.getOrDefault(`{${token1}}`, () => "");

    const tokenText1 = tokenHandler(partTokenMatch(groups["customFormat1"]));

    if (tokenText1 === "") {
      return "";
    }

    const prefix = groups["prefix"] ?? "";
    let tokenText2 = "";
    const separator = groups["separator"] ?? "";
    const suffix = groups["suffix"] ?? "";

    const token2 = groups["token2"];
    if (token2 !== undefined && token2 !== "") {
      tokenHandler = tokenHandlers.getOrDefault(`{${token2}}`, () => "");
      tokenText2 = tokenHandler(partTokenMatch(groups["customFormat2"]));
    }

    return `${prefix}${tokenText1}${separator}${tokenText2}${suffix}`;
  }
}

/** Ported from `FileNameBuilder.CleanTitle(string title)` (static). */
export function cleanTitle(title: string): string {
  let result = title.split("&").join("and");
  result = result.replace(SCENIFY_REPLACE_CHARS, " ");
  result = result.replace(SCENIFY_REMOVE_CHARS, "");

  return result;
}

/** Ported from `FileNameBuilder.TitleThe(string title)` (static). */
export function titleThe(title: string): string {
  return title.replace(TITLE_PREFIX_REGEX, "$2, $1$3");
}

/** Ported from the `CleanFileName(string name)` overload that defaults to `NamingConfig.Default`. */
export function cleanFileNameDefault(name: string): string {
  return cleanFileName(name, {
    replaceIllegalCharacters: true,
    colonReplacementFormat: ColonReplacementFormat.Smart,
  });
}

/** Ported from `FileNameBuilder.CleanFolderName(string name)` (static). */
export function cleanFolderName(name: string): string {
  const cleaned = name.replace(FILE_NAME_CLEANUP_REGEX, (m) => m[0] ?? "");
  return trimChars(cleaned, [" ", "."]);
}

/**
 * Ported from the private static `CleanFileName(string name, NamingConfig
 * namingConfig)` -- the actual illegal-character sanitizer every token
 * replacement and CleanFileName(name) funnel through.
 */
export function cleanFileName(
  name: string,
  namingConfig: Pick<NamingConfig, "replaceIllegalCharacters" | "colonReplacementFormat">
): string {
  let result = name;
  const badCharacters = ["\\", "/", "<", ">", "?", "*", "|", '"'];
  const goodCharacters = ["+", "+", "", "", "!", "-", "", ""];

  if (namingConfig.replaceIllegalCharacters) {
    if (namingConfig.colonReplacementFormat === ColonReplacementFormat.Smart) {
      result = result.split(": ").join(" - ");
      result = result.split(":").join("-");
    } else {
      let replacement: string;

      switch (namingConfig.colonReplacementFormat) {
        case ColonReplacementFormat.Dash:
          replacement = "-";
          break;
        case ColonReplacementFormat.SpaceDash:
          replacement = " -";
          break;
        case ColonReplacementFormat.SpaceDashSpace:
          replacement = " - ";
          break;
        default:
          replacement = "";
          break;
      }

      result = result.split(":").join(replacement);
    }
  } else {
    result = result.split(":").join("");
  }

  for (let i = 0; i < badCharacters.length; i++) {
    const bad = badCharacters[i]!;
    const good = namingConfig.replaceIllegalCharacters ? (goodCharacters[i] ?? "") : "";
    result = result.split(bad).join(good);
  }

  return trimStartChars(result, [" ", "."]).replace(/ +$/, "");
}

// ---- private helpers ----

function authorDisplayName(author: Author): string {
  // Author has no direct `.name` field in this port (see books/models.ts's
  // doc comment on ForeignAuthorId/Name "compatibility properties" -- the
  // real C# `Author.Name` proxies through `Metadata.Value.Name`).
  return author.metadata?.name ?? "";
}

function getQualityProper(bookFile: BookFileLike): string {
  // Forward-ref surface: only `quality.revision` is read here, so the
  // BookFileLike.quality type above only declares `.quality.id`; callers
  // pass the real QualityModel which also carries `.revision`.
  const revision = (
    bookFile.quality as unknown as { revision?: { version: number; isRepack: boolean } }
  ).revision;

  if (revision && revision.version > 1) {
    return revision.isRepack ? "Repack" : "Proper";
  }

  return "";
}

function getOriginalTitle(bookFile: BookFileLike): string {
  if (isBlank(bookFile.sceneName)) {
    return getOriginalFileName(bookFile);
  }

  return bookFile.sceneName as string;
}

/**
 * Ported from `Path.GetFileNameWithoutExtension(bookFile.Path)`. .NET's
 * `Path.GetFileNameWithoutExtension` splits on both `/` and `\` regardless
 * of the running OS (matching its OS-agnostic `Path.GetFileName`); Node's
 * `path.basename` only recognizes the *current platform's* separator (on
 * Linux CI, a Windows-style path like `C:\Test\Author - 01` would NOT be
 * split on `\`). Split manually on both separators here to match .NET's
 * actual cross-platform behavior rather than `node:path`'s platform-specific
 * one (this project's CI runs on ubuntu-latest -- see .github/workflows/
 * ci.yml -- so a `node:path`-based implementation would silently diverge
 * from a Windows-authored naming pattern under test).
 */
function getOriginalFileName(bookFile: BookFileLike): string {
  const lastSep = Math.max(bookFile.path.lastIndexOf("/"), bookFile.path.lastIndexOf("\\"));
  const base = lastSep >= 0 ? bookFile.path.slice(lastSep + 1) : bookFile.path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function isBlankOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function isNotBlankOrWhitespace(value: string | null | undefined): boolean {
  return !isBlankOrWhitespace(value);
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

function firstCharToUpper(value: string): string {
  return value.length === 0 ? value : (value[0] ?? "").toUpperCase() + value.slice(1);
}

function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/[/\\]+$/, ""))
    .join("/")
    .replace(/\/+/g, "/");
}

function trimStartChars(value: string, chars: string[]): string {
  let start = 0;
  while (start < value.length && chars.includes(value[start] ?? "")) {
    start++;
  }
  return value.slice(start);
}

function trimChars(value: string, chars: string[]): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start] ?? "")) {
    start++;
  }
  while (end > start && chars.includes(value[end - 1] ?? "")) {
    end--;
  }
  return value.slice(start, end);
}

/**
 * Ported from `bookFile.Part.ToString(m.CustomFormat)` /
 * `bookFile.PartCount.ToString(m.CustomFormat)`: C#'s numeric
 * `ToString(format)` with a "0"-repeated custom format string (e.g. "00",
 * "000") zero-pads to that many digits; any other/empty format falls back
 * to a plain decimal string (matching .NET's behavior for formats this
 * naming engine actually produces -- PartRegex's `customFormat1`/
 * `customFormat2` groups only ever capture `[a-z0-9]+`).
 */
function formatNumber(value: number, format: string | null): string {
  if (format && /^0+$/.test(format)) {
    return String(value).padStart(format.length, "0");
  }

  return String(value);
}

/**
 * Ported from `FileNameBuilder.GetTrackFormat(string pattern)`: matches
 * `SeasonEpisodePatternRegex` (a `{season}...{episode}` TV-naming pattern --
 * see this file's module doc comment on `getBasicNamingConfig` for why this
 * always returns empty against real book naming patterns). Ported for shape
 * fidelity only.
 */
const SEASON_EPISODE_PATTERN_REGEX =
  /(?<separator>(?<=\})[- ._]+?)?(?<seasonEpisode>s?\{season(?::0+)?\}(?<episodeSeparator>[- ._]?[ex])(?<episode>\{episode(?::0+)?\}))(?<separator2>[- ._]+?(?=\{))?/gi;

function getTrackFormat(pattern: string): BookFormatResult[] {
  const results: BookFormatResult[] = [];
  // The C# regex reuses the named group `separator` across two disjoint,
  // non-alternation positions (a leading optional group and a trailing
  // optional group) -- .NET permits re-using a capture group name for
  // multiple *sequential* groups (not `|`-alternation branches) as long as
  // they aren't both captured groups active at once; JS's RegExp does NOT
  // allow the same named group to appear twice at all, even sequentially
  // (this is exactly the class of bug this project's check:regex script
  // exists to catch -- see PORT_PLAN.md / CI history). Ported here with the
  // second `separator` renamed to `separator2` to keep this compiling on
  // Node while preserving both captures; nothing in this file reads
  // `BookFormat.separator`/`.bookSeparator` from real book patterns (see
  // the module doc comment -- `GetBasicNamingConfig` only reads `.Separator`
  // off the *last* match, and only when a `{season}`/`{episode}` token
  // exists at all, which real book patterns never contain), so this rename
  // has no observable effect on any call site.
  for (const match of pattern.matchAll(new RegExp(SEASON_EPISODE_PATTERN_REGEX))) {
    results.push({
      bookSeparator: match.groups?.["episodeSeparator"] ?? "",
      separator: match.groups?.["separator"] ?? "",
      bookPattern: match.groups?.["episode"] ?? "",
    });
  }
  return results;
}

interface BookFormatResult {
  separator: string;
  bookPattern: string;
  bookSeparator: string;
}
