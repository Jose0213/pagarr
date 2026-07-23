import type { Author } from "../books/index.js";
import { newParsedTrackInfo } from "../parser/model/parsedTrackInfo.js";
import { newLocalBook, type LocalBook } from "../parser/model/localBook.js";
import { parseBookTitle } from "../parser/parser.js";
import { ImportDecision, Rejection } from "./bookImport/importDecision.js";
import { ImportMode } from "./importMode.js";
import { FilterFilesType } from "./filterFilesType.js";
import { ImportResult } from "./bookImport/importResult.js";
import { ImportResultType } from "./importResultType.js";
import type { IMakeImportDecision } from "./bookImport/importDecisionMaker.js";
import type { IImportApprovedBooks } from "./bookImport/importApprovedBooks.js";
import type { IMediaFilesEventAggregator } from "./events.js";
import { TrackImportFailedEvent } from "./events.js";
import type {
  DirectoryInfoLike,
  FileInfoLike,
  IMediaFileDiskProvider,
} from "./mediaFileDiskProvider.js";
import type { DownloadClientItemLike } from "./bookImport/importDecisionEngineSpecification.js";

/** Ported from the slice of `IParsingService` this service calls. */
export interface ParsingServiceLike {
  getAuthor(title: string): Author | undefined;
}

/** Ported from the slice of `IAuthorService` this service calls. */
export interface AuthorPathLookup {
  authorPathExists(path: string): boolean;
}

/**
 * Ported from the slice of `IDiskScanService` this service calls
 * (`NzbDrone.Core/MediaFiles/DiskScanService.cs`, a top-level MediaFiles
 * file NOT in this worktree's SCOPE -- only the file list documented in
 * this module's task brief is in scope). Narrowed forward-reference.
 */
export interface DiskScanServiceLike {
  getBookFiles(path: string, allowDeep?: boolean): FileInfoLike[];
  filterFiles(path: string, files: FileInfoLike[]): FileInfoLike[];
}

/** Forward-reference for `NzbDrone.Common.EnvironmentInfo.IRuntimeInfo.IsWindowsService`. */
export interface RuntimeInfoLike {
  isWindowsService: boolean;
}

export interface IDownloadedBooksImportService {
  processRootFolder(directoryInfo: DirectoryInfoLike): Promise<ImportResult[]>;
  processPath(
    path: string,
    importMode?: ImportMode,
    author?: Author | null,
    downloadClientItem?: DownloadClientItemLike | null
  ): Promise<ImportResult[]>;
  shouldDeleteFolder(directoryInfo: DirectoryInfoLike): boolean;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/DownloadedBooksImportService.cs.
 *
 * `ProcessRootFolder`/`ProcessPath`/`ProcessFolder`/`ProcessFile` are
 * `async` because `IMakeImportDecision.getImportDecisions` and
 * `IImportApprovedBooks.import` (both this module's own, already-ported
 * files) are Promise-based -- see importDecisionMaker.ts's doc comment
 * for why.
 */
export class DownloadedBooksImportService implements IDownloadedBooksImportService {
  constructor(
    private readonly diskProvider: IMediaFileDiskProvider,
    private readonly diskScanService: DiskScanServiceLike,
    private readonly authorService: AuthorPathLookup,
    private readonly parsingService: ParsingServiceLike,
    private readonly importDecisionMaker: IMakeImportDecision,
    private readonly importApprovedTracks: IImportApprovedBooks,
    private readonly eventAggregator: IMediaFilesEventAggregator,
    private readonly runtimeInfo: RuntimeInfoLike,
    /** Stand-in for NLog `_logger.Error(...)` in LogInaccessiblePathError -- see monitorNewBookService.ts's doc comment for why this codebase omits NLog. Defaults to a no-op. */
    private readonly onInaccessiblePath: (message: string) => void = () => {}
  ) {}

  async processRootFolder(directoryInfo: DirectoryInfoLike): Promise<ImportResult[]> {
    const results: ImportResult[] = [];

    for (const subFolder of this.diskProvider.getDirectoryInfos(directoryInfo.fullName)) {
      const folderResults = await this.processFolderAuto(subFolder, ImportMode.Auto, null);
      results.push(...folderResults);
    }

    for (const audioFile of this.diskScanService.getBookFiles(directoryInfo.fullName, false)) {
      const fileResults = await this.processFileAuto(audioFile, ImportMode.Auto, null);
      results.push(...fileResults);
    }

    return results;
  }

  async processPath(
    path: string,
    importMode: ImportMode = ImportMode.Auto,
    author: Author | null = null,
    downloadClientItem: DownloadClientItemLike | null = null
  ): Promise<ImportResult[]> {
    if (this.diskProvider.folderExists(path)) {
      const directoryInfo = this.diskProvider.getDirectoryInfo(path);

      if (author === null) {
        return this.processFolderAuto(directoryInfo, importMode, downloadClientItem);
      }

      return this.processFolder(directoryInfo, importMode, author, downloadClientItem);
    }

    if (this.diskProvider.fileExists(path)) {
      const fileInfo = this.diskProvider.getFileInfo(path);

      if (author === null) {
        return this.processFileAuto(fileInfo, importMode, downloadClientItem);
      }

      return this.processFile(fileInfo, importMode, author, downloadClientItem);
    }

    this.logInaccessiblePathError(path);
    this.eventAggregator.publishEvent(
      new TrackImportFailedEvent(null, null, true, downloadClientItem)
    );

    return [];
  }

  shouldDeleteFolder(directoryInfo: DirectoryInfoLike): boolean {
    try {
      const bookFiles = this.diskScanService.getBookFiles(directoryInfo.fullName);
      const rarFiles = this.diskProvider
        .getFiles(directoryInfo.fullName, true)
        .filter((f) => getExtension(f).toLowerCase() === ".rar");

      for (const bookFile of bookFiles) {
        const bookParseResult = parseBookTitle(bookFile.name);

        if (bookParseResult === null) {
          return false;
        }

        return false;
      }

      if (rarFiles.some((f) => this.diskProvider.getFileSize(f) > 10 * 1024 * 1024)) {
        return false;
      }

      return true;
    } catch {
      // Ported from the C# source's DirectoryNotFoundException + general
      // Exception catch clauses, both just logged and returning false.
      return false;
    }
  }

  private async processFolderAuto(
    directoryInfo: DirectoryInfoLike,
    importMode: ImportMode,
    downloadClientItem: DownloadClientItemLike | null
  ): Promise<ImportResult[]> {
    const cleanedUpName = getCleanedUpFolderName(directoryInfo.name);
    const author = this.parsingService.getAuthor(cleanedUpName) ?? null;

    return this.processFolder(directoryInfo, importMode, author, downloadClientItem);
  }

  private async processFolder(
    directoryInfo: DirectoryInfoLike,
    importMode: ImportMode,
    author: Author | null,
    downloadClientItem: DownloadClientItemLike | null
  ): Promise<ImportResult[]> {
    if (this.authorService.authorPathExists(directoryInfo.fullName)) {
      return [];
    }

    const folderInfo = parseBookTitle(directoryInfo.name);

    // Ported from the C# source's `var trackInfo = new ParsedTrackInfo {
    // ... }` / `trackInfo = null` branches: `trackInfo` is computed here
    // but never read afterward anywhere in the real
    // `DownloadedBooksImportService.ProcessFolder` body -- genuinely dead
    // code in the upstream source, not a porting omission. Preserved
    // faithfully (computed for its side-effect-free construction only)
    // per this module's task brief rather than silently deleted as
    // "unused code cleanup".
    if (folderInfo !== null) {
      const trackInfo = newParsedTrackInfo();
      trackInfo.bookTitle = folderInfo.bookTitle;
      trackInfo.authors = [folderInfo.authorName];
      trackInfo.quality = folderInfo.quality;
      trackInfo.releaseGroup = folderInfo.releaseGroup;
      trackInfo.releaseHash = folderInfo.releaseHash;
    }

    const audioFiles = this.diskScanService.filterFiles(
      directoryInfo.fullName,
      this.diskScanService.getBookFiles(directoryInfo.fullName)
    );

    if (downloadClientItem === null) {
      for (const audioFile of audioFiles) {
        if (this.diskProvider.isFileLocked(audioFile.fullName)) {
          return [fileIsLockedResult(audioFile.fullName)];
        }
      }
    }

    const idOverrides = author !== null ? { author } : {};
    const idInfo = { downloadClientItem, parsedBookInfo: folderInfo };
    const idConfig = {
      filter: FilterFilesType.None,
      newDownload: true,
      singleRelease: false,
      includeExisting: false,
      addNewAuthors: false,
    };

    const decisions = await this.importDecisionMaker.getImportDecisions(
      audioFiles,
      idOverrides,
      idInfo,
      idConfig
    );
    const importResults = await this.importApprovedTracks.import(
      decisions,
      true,
      downloadClientItem,
      importMode
    );

    let resolvedImportMode = importMode;
    if (resolvedImportMode === ImportMode.Auto) {
      resolvedImportMode =
        downloadClientItem === null || downloadClientItem.canMoveFiles
          ? ImportMode.Move
          : ImportMode.Copy;
    }

    if (
      resolvedImportMode === ImportMode.Move &&
      importResults.some((i) => i.result === ImportResultType.Imported) &&
      this.shouldDeleteFolder(directoryInfo)
    ) {
      try {
        this.diskProvider.deleteFolder(directoryInfo.fullName, true);
      } catch {
        // Ported from the C# source's IOException catch: logged, not fatal.
      }
    }

    return importResults;
  }

  private async processFileAuto(
    fileInfo: FileInfoLike,
    importMode: ImportMode,
    downloadClientItem: DownloadClientItemLike | null
  ): Promise<ImportResult[]> {
    const author = this.parsingService.getAuthor(fileNameWithoutExtension(fileInfo.name));

    if (author === undefined) {
      return [unknownAuthorResult(`Unknown Author for file: ${fileInfo.name}`, fileInfo.fullName)];
    }

    return this.processFile(fileInfo, importMode, author, downloadClientItem);
  }

  private async processFile(
    fileInfo: FileInfoLike,
    importMode: ImportMode,
    author: Author,
    downloadClientItem: DownloadClientItemLike | null
  ): Promise<ImportResult[]> {
    if (fileNameWithoutExtension(fileInfo.name).startsWith("._")) {
      const localBook = newLocalBook();
      localBook.path = fileInfo.fullName;
      return [
        new ImportResult(
          new ImportDecision(
            localBook,
            new Rejection("Invalid music file, filename starts with '._'")
          ),
          "Invalid music file, filename starts with '._'"
        ),
      ];
    }

    if (downloadClientItem === null) {
      if (this.diskProvider.isFileLocked(fileInfo.fullName)) {
        return [fileIsLockedResult(fileInfo.fullName)];
      }
    }

    const idOverrides = { author };
    const idInfo = { downloadClientItem };
    const idConfig = {
      filter: FilterFilesType.None,
      newDownload: true,
      singleRelease: false,
      includeExisting: false,
      addNewAuthors: false,
    };

    const decisions = await this.importDecisionMaker.getImportDecisions(
      [fileInfo],
      idOverrides,
      idInfo,
      idConfig
    );

    return this.importApprovedTracks.import(decisions, true, downloadClientItem, importMode);
  }

  private logInaccessiblePathError(path: string): void {
    if (this.runtimeInfo.isWindowsService) {
      const mounts = this.diskProvider.getMounts();
      const mount = mounts.find((m) => m.rootDirectory === pathRoot(path));

      if (mount === undefined) {
        this.onInaccessiblePath(
          `Import failed, path does not exist or is not accessible by Pagarr: ${path}. Unable to find a volume mounted for the path. If you're using a mapped network drive see the FAQ for more info`
        );
        return;
      }

      if (mount.driveType === "network") {
        this.onInaccessiblePath(
          `Import failed, path does not exist or is not accessible by Pagarr: ${path}. It's recommended to avoid mapped network drives when running as a Windows service. See the FAQ for more info`
        );
        return;
      }
    }

    if (process.platform === "win32") {
      if (path.startsWith("\\\\")) {
        this.onInaccessiblePath(
          `Import failed, path does not exist or is not accessible by Pagarr: ${path}. Ensure the user running Pagarr has access to the network share`
        );
        return;
      }
    }

    this.onInaccessiblePath(
      `Import failed, path does not exist or is not accessible by Pagarr: ${path}. Ensure the path exists and the user running Pagarr has the correct permissions to access this file/folder`
    );
  }
}

function getCleanedUpFolderName(folder: string): string {
  return folder.replace(/_UNPACK_/g, "").replace(/_FAILED_/g, "");
}

function fileIsLockedResult(audioFile: string): ImportResult {
  const localBook = newLocalBook();
  localBook.path = audioFile;
  return new ImportResult(
    new ImportDecision(localBook, new Rejection("Locked file, try again later")),
    "Locked file, try again later"
  );
}

function unknownAuthorResult(message: string, bookFile?: string): ImportResult {
  let localTrack: LocalBook | null = null;
  if (bookFile !== undefined) {
    localTrack = newLocalBook();
    localTrack.path = bookFile;
  }

  return new ImportResult(
    new ImportDecision(localTrack as LocalBook, new Rejection("Unknown Author")),
    message
  );
}

function fileNameWithoutExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.substring(0, dotIndex) : name;
}

function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex === -1 ? "" : base.substring(dotIndex);
}

/** Ported from `System.IO.Path.GetPathRoot(path)`. */
function pathRoot(path: string): string {
  const winMatch = /^[a-zA-Z]:\\?/.exec(path);
  if (winMatch) {
    return winMatch[0];
  }
  if (path.startsWith("\\\\")) {
    return path;
  }
  if (path.startsWith("/")) {
    return "/";
  }
  return "";
}
