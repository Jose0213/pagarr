import type { Author } from "../books/models.js";
import type { CustomFormat } from "./customFormat.js";
import type { CustomFormatInput, ParsedBookInfo } from "./customFormatInput.js";
import { IndexerFlags } from "./indexerFlags.js";
import { didMatch, type SpecificationMatchesGroup } from "./specificationMatchesGroup.js";
import type { ICustomFormatSpecification } from "./specifications/customFormatSpecification.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/CustomFormatCalculationService.cs's
 * overload set. Each overload's real C# input type belongs to a module that
 * hasn't landed yet:
 *   - `RemoteBook`, `LocalBook` -- Parser (NzbDrone.Core/Parser/Model/)
 *   - `BookFile` -- MediaFiles
 *   - `Blocklist` -- Blocklisting
 *   - `EntityHistory` -- History
 *   - `Author` -- Books (PORTED, available at ../books/models.js -- used directly)
 *
 * FORWARD-REFERENCE: these four are declared as minimal local interfaces
 * capturing only the fields `CustomFormatCalculationService` actually reads
 * off each one (mirroring the exact same narrowing this port applies
 * elsewhere for not-yet-ported cross-module dependencies, e.g.
 * `profiles/qualities/qualityProfileService.ts`'s `AuthorProfileUsageLookup`
 * / `ImportListProfileUsageLookup`). When Parser/MediaFiles/Blocklisting/
 * History land, each of these should be replaced by (or narrowed from) the
 * real ported type; the field names below already match the real C#
 * property names (camelCased) so that swap should be a type-only change.
 *
 * `Parser.Parser.ParseBookTitle(sourceTitle)` (used by the Blocklist/
 * EntityHistory overloads to recover a release title + release group from a
 * historical source title) is also Parser-module territory and not ported.
 * Both overloads take an *already-parsed* `ParsedBookInfo | null` via an
 * injected `parseBookTitle` function instead (defaulting to a no-op that
 * always returns `null`, matching "parser unavailable" -- the C# fallback
 * path when `parsed` is null already falls back to the raw `SourceTitle`
 * verbatim, which the default preserves).
 */
export interface RemoteBookLike {
  parsedBookInfo: ParsedBookInfo | null;
  author: Author;
  /** `ReleaseInfo.IndexerFlags` -- `Release` itself is optional in C# (`remoteBook.Release?.IndexerFlags ?? 0`). */
  release?: { indexerFlags?: IndexerFlags | number } | null;
}

export interface BookFileLike {
  sceneName: string | null;
  originalFilePath: string | null;
  path: string;
  quality?: unknown;
  releaseGroup: string | null;
  size: number;
  indexerFlags: IndexerFlags | number;
}

export interface BlocklistLike {
  sourceTitle: string;
  quality?: unknown;
  size: number | null;
  indexerFlags: IndexerFlags | number;
}

export interface EntityHistoryLike {
  sourceTitle: string;
  quality?: unknown;
  /** `EntityHistory.Data` -- a `Dictionary<string, string>` in C#; `GetValueOrDefault("size")`/`("indexerFlags")` are read via `data.size`/`data.indexerFlags` here. */
  data: Record<string, string | undefined>;
}

export interface LocalBookLike {
  author: Author;
  sceneName: string | null;
  quality?: unknown;
  releaseGroup: string | null;
  size: number;
  indexerFlags: IndexerFlags | number;
}

/** Ported from `Parser.Parser.ParseBookTitle(string title)`'s return shape, as consumed here. */
export interface ParsedTitleResult {
  releaseTitle: string | null;
  releaseGroup: string | null;
}

export interface CustomFormatCalculationServiceDeps {
  /** Forward-reference for `Parser.Parser.ParseBookTitle` -- see module doc comment. Defaults to "no parse available" (returns null, same as the C# source's null-parse fallback path). */
  parseBookTitle?: (title: string) => ParsedTitleResult | null;
}

export interface CustomFormatLookup {
  all(): CustomFormat[];
}

/**
 * Ported from NzbDrone.Core/CustomFormats/CustomFormatCalculationService.cs.
 */
export class CustomFormatCalculationService {
  private readonly parseBookTitle: (title: string) => ParsedTitleResult | null;

  constructor(
    private readonly formatService: CustomFormatLookup,
    deps: CustomFormatCalculationServiceDeps = {}
  ) {
    this.parseBookTitle = deps.parseBookTitle ?? (() => null);
  }

  /** Ported from `ParseCustomFormat(RemoteBook remoteBook, long size)`. */
  parseCustomFormatForRemoteBook(remoteBook: RemoteBookLike, size: number): CustomFormat[] {
    const input: CustomFormatInput = {
      bookInfo: remoteBook.parsedBookInfo,
      author: remoteBook.author,
      size,
      indexerFlags: remoteBook.release?.indexerFlags ?? 0,
    };

    return this.parseCustomFormatForInput(input);
  }

  /** Ported from `ParseCustomFormat(BookFile bookFile, Author author)` and the parameterless-author overload `ParseCustomFormat(BookFile bookFile)` (which reads `bookFile.Author.Value`; callers here just pass `author` explicitly since this port has no LazyLoaded equivalent). */
  parseCustomFormatForBookFile(bookFile: BookFileLike, author: Author): CustomFormat[] {
    return this.parseCustomFormatForBookFileAgainst(bookFile, author, this.formatService.all());
  }

  /** Ported from `ParseCustomFormat(Blocklist blocklist, Author author)`. */
  parseCustomFormatForBlocklist(blocklist: BlocklistLike, author: Author): CustomFormat[] {
    const parsed = this.parseBookTitle(blocklist.sourceTitle);

    const bookInfo: ParsedBookInfo = {
      authorName: author.metadata?.name,
      releaseTitle: parsed?.releaseTitle ?? blocklist.sourceTitle,
      quality: blocklist.quality,
      releaseGroup: parsed?.releaseGroup ?? null,
    };

    const input: CustomFormatInput = {
      bookInfo,
      author,
      size: blocklist.size ?? 0,
      indexerFlags: blocklist.indexerFlags,
    };

    return this.parseCustomFormatForInput(input);
  }

  /** Ported from `ParseCustomFormat(EntityHistory history, Author author)`. */
  parseCustomFormatForHistory(history: EntityHistoryLike, author: Author): CustomFormat[] {
    const parsed = this.parseBookTitle(history.sourceTitle);

    const size = Number.parseInt(history.data["size"] ?? "", 10);
    const indexerFlagsRaw = history.data["indexerFlags"];
    const indexerFlags = parseIndexerFlagsName(indexerFlagsRaw);

    const bookInfo: ParsedBookInfo = {
      authorName: author.metadata?.name,
      releaseTitle: parsed?.releaseTitle ?? history.sourceTitle,
      quality: history.quality,
      releaseGroup: parsed?.releaseGroup ?? null,
    };

    const input: CustomFormatInput = {
      bookInfo,
      author,
      size: Number.isNaN(size) ? 0 : size,
      indexerFlags,
    };

    return this.parseCustomFormatForInput(input);
  }

  /** Ported from `ParseCustomFormat(LocalBook localBook)`. */
  parseCustomFormatForLocalBook(localBook: LocalBookLike): CustomFormat[] {
    const bookInfo: ParsedBookInfo = {
      authorName: localBook.author.metadata?.name,
      releaseTitle: localBook.sceneName,
      quality: localBook.quality,
      releaseGroup: localBook.releaseGroup,
    };

    const input: CustomFormatInput = {
      bookInfo,
      author: localBook.author,
      size: localBook.size,
      indexerFlags: localBook.indexerFlags,
    };

    return this.parseCustomFormatForInput(input);
  }

  /** Ported from the private `ParseCustomFormat(CustomFormatInput input)` overload. */
  private parseCustomFormatForInput(input: CustomFormatInput): CustomFormat[] {
    return parseCustomFormat(input, this.formatService.all());
  }

  /**
   * Ported from the private instance overload
   * `ParseCustomFormat(BookFile bookFile, Author author, List<CustomFormat> allCustomFormats)`.
   * Resolves a release title with the same fallback order as the C# source:
   * SceneName, then OriginalFilePath, then the file name portion of Path.
   */
  private parseCustomFormatForBookFileAgainst(
    bookFile: BookFileLike,
    author: Author,
    allCustomFormats: CustomFormat[]
  ): CustomFormat[] {
    let releaseTitle = "";

    if (isNotNullOrWhiteSpace(bookFile.sceneName)) {
      releaseTitle = bookFile.sceneName as string;
    } else if (isNotNullOrWhiteSpace(bookFile.originalFilePath)) {
      releaseTitle = bookFile.originalFilePath as string;
    } else if (isNotNullOrWhiteSpace(bookFile.path)) {
      releaseTitle = fileNameFromPath(bookFile.path);
    }

    const bookInfo: ParsedBookInfo = {
      authorName: author.metadata?.name,
      releaseTitle,
      quality: bookFile.quality,
      releaseGroup: bookFile.releaseGroup,
    };

    const input: CustomFormatInput = {
      bookInfo,
      author,
      size: bookFile.size,
      indexerFlags: bookFile.indexerFlags,
      filename: fileNameFromPath(bookFile.path),
    };

    return parseCustomFormat(input, allCustomFormats);
  }
}

/**
 * Ported from the private static
 * `ParseCustomFormat(CustomFormatInput input, List<CustomFormat> allCustomFormats)`
 * -- the actual matching/scoring core every overload funnels into.
 *
 * For each defined CustomFormat, its Specifications are grouped by concrete
 * type (`GroupBy(t => t.GetType())`) into `SpecificationMatchesGroup`s, each
 * evaluated against the input; the CustomFormat matches overall only if
 * *every* group's `DidMatch` is true (see specificationMatchesGroup.ts for
 * that per-group logic). Matching formats are returned sorted by Name.
 */
export function parseCustomFormat(
  input: CustomFormatInput,
  allCustomFormats: CustomFormat[]
): CustomFormat[] {
  const matches: CustomFormat[] = [];

  for (const customFormat of allCustomFormats) {
    const groups = groupSpecificationsByType(customFormat.specifications).map(
      (specsOfType): SpecificationMatchesGroup => ({
        matches: new Map(specsOfType.map((spec) => [spec, spec.isSatisfiedBy(input)])),
      })
    );

    if (groups.every((group) => didMatch(group))) {
      matches.push(customFormat);
    }
  }

  return matches.sort((a, b) => a.name.localeCompare(b.name));
}

/** Ported from `customFormat.Specifications.GroupBy(t => t.GetType())`, preserving first-seen group order (matches LINQ GroupBy semantics). */
function groupSpecificationsByType(
  specifications: ICustomFormatSpecification[]
): ICustomFormatSpecification[][] {
  const order: string[] = [];
  const byType = new Map<string, ICustomFormatSpecification[]>();

  for (const spec of specifications) {
    const key = spec.constructor.name;
    let bucket = byType.get(key);
    if (!bucket) {
      bucket = [];
      byType.set(key, bucket);
      order.push(key);
    }
    bucket.push(spec);
  }

  return order.map((key) => byType.get(key) as ICustomFormatSpecification[]);
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.IsNotNullOrWhiteSpace`. */
function isNotNullOrWhiteSpace(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

/** Ported from `Path.GetFileName(path)`, cross-platform-separator-agnostic (matches .NET's behavior of treating both `/` and `\` as separators on any OS). */
function fileNameFromPath(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Ported from `Enum.TryParse(history.Data.GetValueOrDefault("indexerFlags"), true, out IndexerFlags indexerFlags)`:
 * case-insensitive parse of an IndexerFlags *member name* (not a raw
 * number -- EntityHistory.Data stores the enum's ToString() form) stored in
 * history data; returns 0 (C#'s default(IndexerFlags), and TryParse leaves
 * the out-var at its default on failure) if missing/unparseable.
 */
function parseIndexerFlagsName(raw: string | undefined): IndexerFlags | number {
  if (raw === undefined) {
    return 0;
  }

  const match = Object.entries(IndexerFlags).find(
    ([key, value]) => typeof value === "number" && key.toLowerCase() === raw.toLowerCase()
  );

  return match ? (match[1] as IndexerFlags) : 0;
}
