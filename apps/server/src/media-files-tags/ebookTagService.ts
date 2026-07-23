import { extname } from "node:path";
import { openBook } from "./epub-tag/index.js";
import { Azw3File } from "./azw-tag/index.js";
import { AzwTagException } from "./azw-tag/azwTagException.js";
import { parseTitle } from "../parser/parser.js";
import { newQualityModel } from "../qualities/qualityModel.js";
import { Quality } from "../qualities/quality.js";
import type { QualityDetectionSource } from "../qualities/qualityDetectionSource.js";
import { newParsedTrackInfo, type ParsedTrackInfo } from "../parser/model/parsedTrackInfo.js";
import type { Edition } from "../books/models.js";
import type { RootFolder } from "../root-folders/root-folder.js";
import { newRetagBookFilePreview, type RetagBookFilePreview } from "./retagBookFilePreview.js";
import type {
  CalibreBook,
  CalibreProxyLike,
  RetagAuthorCommand,
  RetagFilesCommand,
} from "./ebookTagTypes.js";
import type { BookFileRef, EditionRef } from "./audioTagTypes.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/EbookTagService.cs.
 *
 * `ReadPdf` (`PdfSharpCore.Pdf.IO.PdfReader.Open(..., PdfDocumentOpenMode.InformationOnly)`,
 * reading just the PDF Info dictionary's Title/Author) is NOT ported: this
 * module's scope (per the task brief) is EpubTag/AzwTag/TorrentInfo plus
 * the handful of files directly under MediaFiles/ -- PdfSharpCore is a
 * large general-purpose PDF *manipulation* library (not just a metadata
 * reader), and pulling in an equally heavy PDF dependency for a single
 * "read two Info-dictionary strings" call is out of proportion with this
 * module's actual scope (EPUB/AZW3 tag reading). `readPdf` below is
 * ported as a narrow, honest stub: it always falls back to the
 * `QualityDetectionSource: "Extension"` path (matching the C# source's own
 * catch-block behavior when PDF reading fails), never claims to have read
 * PDF metadata it didn't actually read, and is clearly marked so a future
 * PDF-metadata module can slot in without changing `readTags`'s dispatch
 * logic.
 *
 * `WriteTags`/`SyncTags`/`GetRetagPreviewsByAuthor`/`GetRetagPreviewsByBook`/
 * `RetagFiles`/`RetagAuthor` all ultimately call into `ICalibreProxy`
 * (`NzbDrone.Core/Books/Calibre/`), a module that isn't ported anywhere in
 * this repo yet -- see ebookTagTypes.ts's header comment for the
 * forward-reference approach taken for `ICalibreProxy`/`CalibreBook`.
 *
 * `IRootFolderService`/`RootFolder` (used by `WriteTagsInternal`) and
 * `IAuthorService`/`Author` are the REAL already-ported types
 * (root-folders/, books/ -- Phase 1), used directly, not forward-referenced.
 * `IMediaFileService` (`GetFilesByAuthor`/`GetFilesByBook`/`Get(ids)`) and
 * `BookFile` are Phase 3 (MediaFiles, the sibling `media-files-import`
 * worktree) and not merged yet -- forward-referenced via
 * `MediaFileServiceLike`/`BookFileRef` (audioTagTypes.ts), the same pattern
 * `decision-engine/mediaFile.ts` already established.
 */

export interface EbookTagServiceLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  progressInfo(message: string, ...args: unknown[]): void;
}

const noopLogger: EbookTagServiceLogger = {
  trace: () => {},
  debug: () => {},
  error: () => {},
  progressInfo: () => {},
};

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/IMediaFileService.cs this module needs. */
export interface MediaFileServiceLike {
  getFilesByAuthor(authorId: number): BookFileRef[];
  getFilesByBook(bookId: number): BookFileRef[];
  get(ids: number[]): BookFileRef[];
}

/** Narrowed to the slice of NzbDrone.Core/Books/IAuthorService.cs this module needs. */
export interface AuthorServiceLike {
  getAuthor(authorId: number): { id: number; name: string };
  getAuthors(authorIds: number[]): { id: number; name: string }[];
}

/** Narrowed to the slice of NzbDrone.Core/RootFolders/RootFolderService.cs this module needs. */
export interface RootFolderServiceLike {
  getBestRootFolder(path: string): RootFolder | undefined;
}

/** Narrowed to the slice of NzbDrone.Core/Configuration/IConfigService.cs this module needs. */
export interface EbookConfigServiceLike {
  writeBookTags: "no" | "newFiles" | "sync" | (string & {});
  updateCovers: boolean;
  embedMetadata: boolean;
}

export interface EbookTagServiceDeps {
  authorService: AuthorServiceLike;
  mediaFileService: MediaFileServiceLike;
  rootFolderService: RootFolderServiceLike;
  configService: EbookConfigServiceLike;
  calibre: CalibreProxyLike;
  /** Ported from `edition.Language.CanonicalizeLanguage()` -- see ebookTagTypes.ts's header comment for why this is injected rather than reimplemented here. */
  canonicalizeLanguage: (raw: string | null) => string | null;
  logger?: EbookTagServiceLogger;
}

export class EbookTagService {
  private readonly authorService: AuthorServiceLike;
  private readonly mediaFileService: MediaFileServiceLike;
  private readonly rootFolderService: RootFolderServiceLike;
  private readonly configService: EbookConfigServiceLike;
  private readonly calibre: CalibreProxyLike;
  private readonly canonicalizeLanguage: (raw: string | null) => string | null;
  private readonly logger: EbookTagServiceLogger;

  constructor(deps: EbookTagServiceDeps) {
    this.authorService = deps.authorService;
    this.mediaFileService = deps.mediaFileService;
    this.rootFolderService = deps.rootFolderService;
    this.configService = deps.configService;
    this.calibre = deps.calibre;
    this.canonicalizeLanguage = deps.canonicalizeLanguage;
    this.logger = deps.logger ?? noopLogger;
  }

  /** Ported from `EBookTagService.ReadTags(IFileInfo file)`. */
  readTags(filePath: string): ParsedTrackInfo | null {
    const extension = extname(filePath).toLowerCase();
    this.logger.trace(`Got extension '${extension}'`);

    switch (extension) {
      case ".pdf":
        return this.readPdf(filePath);
      case ".epub":
      case ".kepub":
        return this.readEpub(filePath);
      case ".azw3":
      case ".mobi":
        return this.readAzw3(filePath);
      default:
        return parseTitle(filePath);
    }
  }

  /** Ported from `EBookTagService.WriteTags(BookFile bookFile, bool newDownload, bool force = false)`. */
  writeTags(file: BookFileRef, newDownload: boolean, force = false): void {
    if (!force) {
      if (this.configService.writeBookTags === "newFiles" && !newDownload) {
        return;
      }
    }

    this.logger.debug(`Writing tags for ${file.path}`);

    this.writeTagsInternal(file, this.configService.updateCovers, this.configService.embedMetadata);
  }

  /** Ported from `EBookTagService.SyncTags(List<Edition> editions)`. */
  syncTags(editions: EditionRef[]): void {
    if (this.configService.writeBookTags !== "sync") {
      return;
    }

    for (const edition of editions) {
      const bookFiles = edition.bookFiles ?? [];

      this.logger.debug(`Syncing ebook tags for ${edition.title}`);

      for (const file of bookFiles.filter((x) => x.calibreId !== 0)) {
        // Populate tracks (which should also have release/book/author set) because
        // not all of the updates will have been committed to the database yet.
        file.edition = edition;

        this.writeTagsInternal(
          file,
          this.configService.updateCovers,
          this.configService.embedMetadata
        );
      }
    }
  }

  /** Ported from `EBookTagService.GetRetagPreviewsByAuthor(int authorId)`. */
  getRetagPreviewsByAuthor(authorId: number): RetagBookFilePreview[] {
    const files = this.mediaFileService.getFilesByAuthor(authorId);
    return this.getPreviews(files);
  }

  /** Ported from `EBookTagService.GetRetagPreviewsByBook(int bookId)`. */
  getRetagPreviewsByBook(bookId: number): RetagBookFilePreview[] {
    const files = this.mediaFileService.getFilesByBook(bookId);
    return this.getPreviews(files);
  }

  /** Ported from `EBookTagService.RetagFiles(RetagFilesCommand message)`. */
  retagFiles(message: RetagFilesCommand): void {
    const author = this.authorService.getAuthor(message.authorId);
    const files = this.mediaFileService.get(message.files);

    this.logger.progressInfo("Re-tagging %d ebook files for %s", files.length, author.name);

    for (const file of files.filter((x) => x.calibreId !== 0)) {
      this.writeTagsInternal(file, message.updateCovers, message.embedMetadata);
    }

    this.logger.progressInfo("Selected ebook files re-tagged for %s", author.name);
  }

  /** Ported from `EBookTagService.RetagAuthor(RetagAuthorCommand message)`. */
  retagAuthor(message: RetagAuthorCommand): void {
    this.logger.debug("Re-tagging all ebook files for selected authors");
    const authorsToRename = this.authorService.getAuthors(message.authorIds);

    for (const author of authorsToRename) {
      const files = this.mediaFileService.getFilesByAuthor(author.id);

      this.logger.progressInfo("Re-tagging all ebook files for author: %s", author.name);

      for (const file of files.filter((x) => x.calibreId !== 0)) {
        this.writeTagsInternal(file, message.updateCovers, message.embedMetadata);
      }

      this.logger.progressInfo("All ebook files re-tagged for %s", author.name);
    }
  }

  private writeTagsInternal(file: BookFileRef, updateCover: boolean, embedMetadata: boolean): void {
    if (file.calibreId === 0) {
      this.logger.trace(`No calibre id for ${file.path}, skipping writing tags`);
    }

    const rootFolder = this.rootFolderService.getBestRootFolder(file.path);

    if (!rootFolder) {
      throw new Error(`File '${file.path}' is not in a root folder.`);
    }

    this.calibre.setFields(file, rootFolder.calibreSettings, updateCover, embedMetadata);
  }

  private getPreviews(files: BookFileRef[]): RetagBookFilePreview[] {
    const calibreFiles = files
      .filter((x) => x.calibreId > 0)
      .sort((a, b) => (a.edition?.title ?? "").localeCompare(b.edition?.title ?? ""));

    const rootFolderPairs = calibreFiles.map(
      (file) => [file, this.rootFolderService.getBestRootFolder(file.path)] as const
    );

    const rootFolderGroups = new Map<string, (readonly [BookFileRef, RootFolder | undefined])[]>();
    for (const pair of rootFolderPairs) {
      const key = pair[1]?.path ?? "";
      const group = rootFolderGroups.get(key);
      if (group) {
        group.push(pair);
      } else {
        rootFolderGroups.set(key, [pair]);
      }
    }

    const calibreBooks: CalibreBook[] = [];
    for (const group of rootFolderGroups.values()) {
      const rootFolder = group[0]![1];
      const books = this.calibre.getBooks(
        group.map(([file]) => file.calibreId),
        rootFolder?.calibreSettings ?? null
      );
      calibreBooks.push(...books);
    }

    const dict = new Map(calibreBooks.map((book) => [book.id, book]));

    const results: RetagBookFilePreview[] = [];

    for (const file of calibreFiles) {
      const edition = file.edition;
      const book = edition?.book;
      if (!edition || !book) {
        continue;
      }

      const seriesLink = (book.seriesLinks ?? [])
        .slice()
        .sort((a, b) => (a.seriesPosition ?? 0) - (b.seriesPosition ?? 0))
        .find((x) => (x.series?.title ?? "").trim() !== "");

      const series = seriesLink?.series;
      let seriesIndex: number | null = null;
      if (seriesLink?.position) {
        const parsed = Number(seriesLink.position);
        if (!Number.isNaN(parsed)) {
          this.logger.trace(`Parsed ${seriesLink.position} as ${parsed}`);
          seriesIndex = parsed;
        }
      }

      const oldTags = dict.get(file.calibreId);
      if (!oldTags) {
        continue;
      }

      const genres = (book.genres ?? []).map((g) => titleCase(g.replace(/-/g, " ")));

      // Ported from `new CalibreBook { Title = ..., Authors = ..., ... }`:
      // C# object-initializer syntax only sets the listed members --
      // `AuthorSort` (and any other unlisted field) is left at its C#
      // default (`null` for a `string`), matched here explicitly.
      const newTags: CalibreBook = {
        id: oldTags.id,
        authorSort: null,
        title: edition.title,
        authors: [file.author?.metadata?.name ?? ""],
        pubDate: book.releaseDate,
        publisher: edition.publisher,
        languages: [this.canonicalizeLanguage(edition.language) ?? ""],
        tags: genres,
        comments: edition.overview,
        rating: Math.round((edition.ratings?.value ?? 0) * 2) / 2,
        identifiers: {
          isbn: edition.isbn13,
          asin: edition.asin,
          goodreads: book.foreignEditionId ?? null,
        },
        series: series?.title ?? null,
        position: seriesIndex,
      };

      const diff = calibreBookDiff(oldTags, newTags);

      if (Object.keys(diff).length > 0) {
        results.push(
          newRetagBookFilePreview({
            authorId: file.author?.id ?? 0,
            bookId: edition.id,
            bookFileId: file.id,
            path: file.path,
            changes: diff,
          })
        );
      }
    }

    return results;
  }

  private readEpub(file: string): ParsedTrackInfo {
    this.logger.trace(`Reading ${file}`);
    const result = newParsedTrackInfo();
    result.quality = newQualityModel(Quality.EPUB);
    result.quality.qualityDetectionSource = "TagLib" satisfies QualityDetectionSource;

    try {
      const bookRef = openBook(file);
      try {
        result.authors = bookRef.authorList;
        result.bookTitle = bookRef.title;

        const meta = bookRef.schema?.package.metadata;

        this.logger.trace(JSON.stringify(meta));

        result.isbn = this.getIsbn(meta?.identifiers ?? []);
        result.asin =
          meta?.identifiers.find((x) => x.scheme?.toLowerCase().includes("asin"))?.identifier ??
          null;
        result.language = meta?.languages[0] ?? null;
        result.publisher = meta?.publishers[0] ?? null;
        result.disambiguation = meta?.description ?? null;

        result.seriesTitle =
          meta?.metaItems.find((x) => x.name === "calibre:series")?.content ?? null;
        result.seriesIndex =
          meta?.metaItems.find((x) => x.name === "calibre:series_index")?.content ?? null;
      } finally {
        bookRef.dispose();
      }
    } catch (e) {
      this.logger.error("Error reading epub", e);
      if (result.quality) {
        result.quality.qualityDetectionSource = "Extension" satisfies QualityDetectionSource;
      }
    }

    this.logger.trace(`Got:\n${JSON.stringify(result)}`);

    return result;
  }

  private readAzw3(file: string): ParsedTrackInfo {
    this.logger.trace(`Reading ${file}`);
    const result = newParsedTrackInfo();

    try {
      const book = new Azw3File(file);
      result.authors = book.authors;
      result.bookTitle = book.title;
      result.isbn = this.stripIsbn(book.isbn);
      result.asin = book.asin;
      result.language = book.language;
      result.disambiguation = book.description;
      result.publisher = book.publisher;
      result.label = book.imprint;
      result.source = book.source;

      result.quality = newQualityModel(book.version <= 6 ? Quality.MOBI : Quality.AZW3);
      result.quality.qualityDetectionSource = "TagLib" satisfies QualityDetectionSource;
    } catch (e) {
      this.logger.error("Error reading file", e);

      result.quality = newQualityModel(extname(file) === ".mobi" ? Quality.MOBI : Quality.AZW3);
      result.quality.qualityDetectionSource = "Extension" satisfies QualityDetectionSource;

      if (!(e instanceof AzwTagException) && !(e instanceof Error)) {
        throw e;
      }
    }

    this.logger.trace(`Got ${JSON.stringify(result)}`);

    return result;
  }

  private readPdf(file: string): ParsedTrackInfo {
    // See module doc comment: PDF metadata reading (PdfSharpCore in the C#
    // source) is out of this module's scope -- always falls back to the
    // same "Extension" detection source the real C# source uses when PDF
    // reading itself fails.
    this.logger.trace(`Reading ${file}`);
    const result = newParsedTrackInfo();
    result.quality = newQualityModel(Quality.PDF);
    result.quality.qualityDetectionSource = "Extension" satisfies QualityDetectionSource;

    this.logger.trace(`Got:\n${JSON.stringify(result)}`);

    return result;
  }

  /** Ported from `EBookTagService.GetIsbn(IEnumerable<EpubMetadataIdentifier> ids)`. */
  getIsbn(ids: { identifier: string }[]): string | null {
    const candidates = ids
      .map((x) => this.stripIsbn(x.identifier))
      .filter((x): x is string => x !== null)
      .sort((a, b) => b.length - a.length);

    return (
      candidates.find((x) => x.startsWith("978")) ??
      candidates.find((x) => x.startsWith("979")) ??
      candidates[0] ??
      null
    );
  }

  private getIsbnChars(input: string | null): string | null {
    if (input === null) {
      return null;
    }

    return Array.from(input)
      .filter((c) => /\d/.test(c) || c === "X" || c === "x")
      .join("");
  }

  private stripIsbn(input: string | null): string | null {
    const isbn = this.getIsbnChars(input);

    if (isbn === null) {
      return null;
    } else if (
      (isbn.length === 10 && validateIsbn10(isbn)) ||
      (isbn.length === 13 && validateIsbn13(isbn))
    ) {
      return isbn;
    }

    return null;
  }
}

function isbn10Checksum(isbn: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(isbn[i]) * (10 - i);
  }

  const result = sum % 11;

  if (result === 0) {
    return "0";
  } else if (result === 1) {
    return "X";
  }

  return String(11 - result)[0]!;
}

function isbn13Checksum(isbn: string): string {
  let result = 0;
  for (let i = 0; i < 12; i++) {
    result += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }

  result %= 10;

  return result === 0 ? "0" : String(10 - result)[0]!;
}

function validateIsbn10(isbn: string): boolean {
  return /^\d{9}$/.test(isbn.substring(0, 9)) && isbn[9] === isbn10Checksum(isbn);
}

function validateIsbn13(isbn: string): boolean {
  return /^\d{13}$/.test(isbn) && isbn[12] === isbn13Checksum(isbn);
}

/** Ported from `CultureInfo.InvariantCulture.TextInfo.ToTitleCase(string)`: uppercases the first letter of each word, lowercases nothing else (matches .NET's TitleCase behavior of leaving already-uppercase runs untouched). */
function titleCase(input: string): string {
  return input.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Ported from `CalibreBook.Diff(CalibreBook other)` (NzbDrone.Core/Books/Calibre/CalibreBook.cs)
 * -- see ebookTagTypes.ts's header comment for why this lives here as a
 * plain function against the forward-referenced `CalibreBook` shape rather
 * than inside a ported Calibre module.
 */
function calibreBookDiff(
  a: CalibreBook,
  b: CalibreBook
): Record<string, [string | null, string | null]> {
  const output: Record<string, [string | null, string | null]> = {};

  if (a.title !== b.title) {
    output["Title"] = [a.title, b.title];
  }

  if (!arraysEqual(a.authors, b.authors)) {
    const oldValue = a.authors.length ? a.authors.join(" / ") : null;
    const newValue = b.authors.length ? b.authors.join(" / ") : null;
    output["Author"] = [oldValue, newValue];
  }

  const oldDate = a.pubDate ? formatMonYyyy(a.pubDate) : null;
  const newDate = b.pubDate ? formatMonYyyy(b.pubDate) : null;
  if (oldDate !== newDate) {
    output["PubDate"] = [oldDate, newDate];
  }

  if (a.publisher !== b.publisher) {
    output["Publisher"] = [a.publisher, b.publisher];
  }

  if (!arraysEqual([...a.languages].sort(), [...b.languages].sort())) {
    output["Languages"] = [a.languages.join(" / "), b.languages.join(" / ")];
  }

  if (!arraysEqual([...a.tags].sort(), [...b.tags].sort())) {
    output["Tags"] = [a.tags.join(" / "), b.tags.join(" / ")];
  }

  if (a.comments !== b.comments) {
    output["Comments"] = [a.comments, b.comments];
  }

  if (a.rating !== b.rating) {
    output["Rating"] = [String(a.rating), String(b.rating)];
  }

  const aIds = Object.entries(a.identifiers)
    .filter(([, v]) => v !== null)
    .sort(([x], [y]) => x.localeCompare(y));
  const bIds = Object.entries(b.identifiers)
    .filter(([, v]) => v !== null)
    .sort(([x], [y]) => x.localeCompare(y));
  if (JSON.stringify(aIds) !== JSON.stringify(bIds)) {
    output["Identifiers"] = [
      aIds.map(([k, v]) => `${k}, ${String(v)}`).join(" / "),
      bIds.map(([k, v]) => `${k}, ${String(v)}`).join(" / "),
    ];
  }

  if (a.series !== b.series) {
    output["Series"] = [a.series, b.series];
  }

  if (a.position !== b.position) {
    output["Series Index"] = [
      a.position === null ? null : String(a.position),
      b.position === null ? null : String(b.position),
    ];
  }

  return output;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

/** Ported from `PubDate.Value.ToString("MMM-yyyy")`. */
function formatMonYyyy(isoDate: string): string {
  const date = new Date(isoDate);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

export type { Edition };
