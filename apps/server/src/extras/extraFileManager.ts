import type { Author, Book } from "../books/models.js";
import type { IConfigService } from "../config/configService.js";
import type { ExtraFile } from "./extraFile.js";
import { getRelativePath } from "./pathHelpers.js";
import { pathEquals } from "../root-folders/path-utils.js";
import { TransferMode, type BookFile, type DiskTransferServiceLike } from "./forwardRefs.js";

/**
 * Ported from NzbDrone.Core/Extras/Files/ExtraFileManager.cs.
 *
 * Constructor-injection deviation: `IDiskProvider` (used only for
 * `MoveFile()` here) is injected as a narrow `moveFile` callback rather
 * than a full forward-ref of the not-yet-ported Common/Disk interface --
 * same rationale as extraFileService.ts's `fileExists` callback.
 *
 * ASYNC DEVIATION: `createAfterAuthorScan`/`createAfterBookImportWithFolders`
 * are typed to allow `Promise<ExtraFile[]>` in addition to the C#
 * original's synchronous `IEnumerable<ExtraFile>`, because
 * `metadata/metadataService.ts`'s real implementation needs to `await` the
 * genuinely-async `IHttpClient.downloadFile` (see that file's module doc
 * comment for the full rationale) -- `others/otherExtraService.ts`'s
 * implementation stays fully synchronous, matching its C# original exactly.
 */
export interface IManageExtraFiles {
  readonly order: number;
  createAfterAuthorScan(author: Author, bookFiles: BookFile[]): ExtraFile[] | Promise<ExtraFile[]>;
  createAfterBookImport(author: Author, bookFile: BookFile): ExtraFile[];
  createAfterBookImportWithFolders(
    author: Author,
    book: Book,
    authorFolder: string | null,
    bookFolder: string | null
  ): ExtraFile[] | Promise<ExtraFile[]>;
  moveFilesAfterRename(author: Author, bookFiles: BookFile[]): ExtraFile[];
  import(
    author: Author,
    bookFile: BookFile,
    path: string,
    extension: string,
    readOnly: boolean
  ): ExtraFile | null;
}

export interface ExtraFileManagerOptions {
  /** Stand-in for the not-yet-ported `IDiskProvider.MoveFile` -- see module doc comment. */
  moveFile?: (sourcePath: string, targetPath: string) => void;
}

/**
 * Ported from ExtraFileManager<TExtraFile>. C#'s `abstract class
 * ExtraFileManager<TExtraFile> : IManageExtraFiles` combines an abstract
 * base (the five `IManageExtraFiles` members subclasses must implement) with
 * two protected helper methods (`ImportFile`/`MoveFile`) concrete subclasses
 * call. Ported as an abstract TS class the same shape: `metadata/
 * metadataService.ts` and `others/otherExtraService.ts` extend this and
 * implement the abstract members, calling `this.importFile(...)`/
 * `this.moveFile(...)` exactly like the C# subclasses call the protected
 * base methods.
 */
export abstract class ExtraFileManager<TExtraFile extends ExtraFile> implements IManageExtraFiles {
  private readonly doMoveFile: (sourcePath: string, targetPath: string) => void;

  constructor(
    protected readonly configService: IConfigService,
    protected readonly diskTransferService: DiskTransferServiceLike,
    options: ExtraFileManagerOptions = {}
  ) {
    this.doMoveFile = options.moveFile ?? (() => {});
  }

  abstract readonly order: number;
  abstract createAfterAuthorScan(
    author: Author,
    bookFiles: BookFile[]
  ): ExtraFile[] | Promise<ExtraFile[]>;
  abstract createAfterBookImport(author: Author, bookFile: BookFile): ExtraFile[];
  abstract createAfterBookImportWithFolders(
    author: Author,
    book: Book,
    authorFolder: string | null,
    bookFolder: string | null
  ): ExtraFile[] | Promise<ExtraFile[]>;
  abstract moveFilesAfterRename(author: Author, bookFiles: BookFile[]): ExtraFile[];
  abstract import(
    author: Author,
    bookFile: BookFile,
    path: string,
    extension: string,
    readOnly: boolean
  ): ExtraFile | null;

  /**
   * Ported from ExtraFileManager.ImportFile(Author author, BookFile
   * bookFile, string path, bool readOnly, string extension, string
   * fileNameSuffix = null): builds the new extra-file name from the
   * book file's own filename (+ optional suffix + extension), transfers it
   * next to the book file (Move, or Copy/HardLinkOrCopy when `readOnly`
   * per `configService.copyUsingHardlinks`), and returns a fresh
   * (un-persisted, `id: 0`) `TExtraFile` shell -- callers upsert it.
   */
  protected importFile(
    author: Author,
    bookFile: BookFile,
    path: string,
    readOnly: boolean,
    extension: string,
    fileNameSuffix: string | null = null,
    makeExtraFile: (base: Omit<ExtraFile, "id">) => TExtraFile = defaultExtraFileFactory as (
      base: Omit<ExtraFile, "id">
    ) => TExtraFile
  ): TExtraFile {
    const newFolder = getDirectoryName(bookFile.path);
    const newFileName = joinPath(
      newFolder,
      getFileNameWithoutExtension(bookFile.path) + (fileNameSuffix ?? "") + extension
    );

    const transferMode = readOnly
      ? this.configService.copyUsingHardlinks
        ? TransferMode.HardLinkOrCopy
        : TransferMode.Copy
      : TransferMode.Move;

    this.diskTransferService.transferFile(path, newFileName, transferMode, true);

    return makeExtraFile({
      authorId: author.id,
      bookId: requireEdition(bookFile).bookId,
      bookFileId: bookFile.id,
      relativePath: getRelativePath(author.path, newFileName),
      extension,
      added: "",
      lastUpdated: "",
    });
  }

  /**
   * Ported from ExtraFileManager.MoveFile(Author author, BookFile bookFile,
   * TExtraFile extraFile, string fileNameSuffix = null): renames the
   * existing extra file to sit next to the book file's new location/name,
   * mutating and returning `extraFile.relativePath` on success, or `null`
   * if the move fails (swallowing the error, matching the C# original's
   * `catch (Exception ex) { _logger.Warn(...); }` then falling through to
   * the implicit `return null`).
   */
  protected moveFile(
    author: Author,
    bookFile: BookFile,
    extraFile: TExtraFile,
    fileNameSuffix: string | null = null
  ): TExtraFile | null {
    const newFolder = getDirectoryName(bookFile.path);
    const newFileName = joinPath(
      newFolder,
      getFileNameWithoutExtension(bookFile.path) + (fileNameSuffix ?? "") + extraFile.extension
    );

    const existingFileName = joinPath(author.path, extraFile.relativePath);

    if (pathEquals(newFileName, existingFileName)) {
      return null;
    }

    try {
      this.doMoveFile(existingFileName, newFileName);
      extraFile.relativePath = getRelativePath(author.path, newFileName);
      return extraFile;
    } catch {
      // Ported: C# logs a warning and returns null rather than propagating.
      return null;
    }
  }
}

function defaultExtraFileFactory(base: Omit<ExtraFile, "id">): ExtraFile {
  return { id: 0, ...base };
}

/**
 * Ported from `bookFile.Edition.Value` -- C#'s `LazyLoaded<Edition>`
 * throws if accessed before being populated. `bookFile.edition` here is a
 * plain caller-populated optional field (see books/models.ts's LazyLoaded
 * convention doc comment); this throws the same way a real
 * `.Value`-on-unloaded access would, rather than silently defaulting to a
 * bogus `bookId`.
 */
function requireEdition(bookFile: BookFile): NonNullable<BookFile["edition"]> {
  if (!bookFile.edition) {
    throw new Error(`BookFile ${bookFile.id}'s Edition has not been loaded`);
  }
  return bookFile.edition;
}

/** Ported from `Path.GetDirectoryName`. */
function getDirectoryName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? "" : trimmed.slice(0, idx);
}

/** Ported from `Path.GetFileNameWithoutExtension`. */
function getFileNameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(0, dotIndex) : base;
}

/** Ported from `Path.Combine`. Matches the local helper in extraFileService.ts (kept separate to avoid a cross-file private-helper import). */
function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}
