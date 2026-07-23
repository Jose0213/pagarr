import { extname } from "node:path";
import type { Author } from "../books/models.js";
import type { IRootFolderService } from "../root-folders/root-folder-service.js";
import { isParentPath } from "../root-folders/path-utils.js";
import { MediaFileExtensions } from "../parser/qualityParser.js";
import type { FileInfoLike, IExtendedDiskProvider } from "./diskProvider.js";
import type { IMediaFileTableCleanupService } from "./mediaFileTableCleanupService.js";
import type { BookFile, MediaFileServiceLike } from "./types.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/DiskScanService.cs.
 *
 * FORWARD-REFERENCES (owned by `media-files-import`, sibling worktree not
 * merged -- real C# sources `MediaFiles/BookImport/ImportDecisionMaker.cs`
 * and `MediaFiles/BookImport/ImportApprovedBooks.cs`):
 *   - `ImportDecisionMakerLike` stands in for `IMakeImportDecision.
 *     GetImportDecisions(...)`.
 *   - `ImportApprovedBooksLike` stands in for `IImportApprovedBooks.Import(...)`.
 *   - `ImportDecisionLike<T>` stands in for `ImportDecision<T>` (Item +
 *     Rejections/Approved).
 * Field/method names copied from the real C# classes so the eventual swap
 * to real imports is mechanical (same pattern as this module's other
 * forward-refs -- see types.ts's header comment).
 *
 * `ICalibreProxy` (calibre-library file listing) is intentionally NOT
 * ported here -- see types.ts's `CalibreProxyLike` doc comment on why
 * calibre integration is out of scope; `getBookFiles` below always takes
 * the non-calibre branch (`rootFolder.isCalibreLibrary` is always false for
 * every RootFolder this port creates).
 *
 * `IExecute<RescanFoldersCommand>` (Messaging module, Phase 4) is exposed as
 * a plain `executeRescanFolders` method, matching this module's established
 * command-dispatch deviation (see recycleBinProvider.ts/
 * renameBookFileService.ts).
 *
 * `AuthorScanSkippedEvent`/`AuthorScannedEvent` publication becomes optional
 * callbacks (`onAuthorScanSkipped`/`onAuthorScanned`), matching
 * bookFileMovingService.ts's `onTrackFolderCreated` pattern.
 */

export enum FilterFilesType {
  None = "None",
  Matched = "Matched",
  Known = "Known",
}

export enum AuthorScanSkippedReason {
  RootFolderDoesNotExist = "RootFolderDoesNotExist",
  RootFolderIsEmpty = "RootFolderIsEmpty",
}

/** Forward-ref for NzbDrone.Core/MediaFiles/BookImport/ImportDecision.cs. */
export interface ImportDecisionLike<T> {
  item: T;
  rejections: unknown[];
  approved: boolean;
}

/** Forward-ref for the minimal shape DiskScanService reads off `LocalBook` (`ImportDecision<LocalBook>.Item`). */
export interface ScannedLocalBookLike {
  path: string;
  calibreId: number;
  part: number;
  partCount: number;
  size: number;
  modified: string;
  quality: BookFile["quality"];
  fileTrackInfo: { mediaInfo: BookFile["mediaInfo"] };
  edition?: BookFile["edition"];
}

/** Forward-ref for `IMakeImportDecision.GetImportDecisions`. */
export interface ImportDecisionMakerLike {
  getImportDecisions(
    files: FileInfoLike[],
    idOverrides: unknown,
    itemInfo: unknown,
    config: ImportDecisionMakerConfig
  ): ImportDecisionLike<ScannedLocalBookLike>[];
}

export interface ImportDecisionMakerConfig {
  filter: FilterFilesType;
  includeExisting: boolean;
  addNewAuthors: boolean;
}

/** Forward-ref for `IImportApprovedBooks.Import`. */
export interface ImportApprovedBooksLike {
  import(decisions: ImportDecisionLike<ScannedLocalBookLike>[], newDownload: boolean): void;
}

export interface AuthorServiceLike {
  getAuthors(authorIds: number[]): Author[];
}

export interface DiskScanServiceOptions {
  onAuthorScanSkipped?: (author: Author, reason: AuthorScanSkippedReason) => void;
  onAuthorScanned?: (author: Author) => void;
}

export interface IDiskScanService {
  scan(
    folders?: string[],
    filter?: FilterFilesType,
    addNewAuthors?: boolean,
    authorIds?: number[]
  ): void;
  getBookFiles(path: string, allDirectories?: boolean): FileInfoLike[];
  getNonBookFiles(path: string, allDirectories?: boolean): string[];
  filterFiles(basePath: string, files: FileInfoLike[]): FileInfoLike[];
  filterPaths(basePath: string, paths: string[]): string[];
}

/** Ported from `DiskScanService.ExcludedSubFoldersRegex`. */
export const EXCLUDED_SUB_FOLDERS_REGEX =
  /(?:\\|\/|^)(?:extras|@eadir|extrafanart|plex versions|\.[^\\/]+)(?:\\|\/)/gi;

/** Ported from `DiskScanService.ExcludedFilesRegex`. */
export const EXCLUDED_FILES_REGEX = /^\._|^Thumbs\.db$|^\.DS_store$|\.partial~$/gi;

export class DiskScanService implements IDiskScanService {
  private readonly onAuthorScanSkipped?: (author: Author, reason: AuthorScanSkippedReason) => void;
  private readonly onAuthorScanned?: (author: Author) => void;

  constructor(
    private readonly diskProvider: IExtendedDiskProvider,
    private readonly mediaFileService: MediaFileServiceLike,
    private readonly importDecisionMaker: ImportDecisionMakerLike,
    private readonly importApprovedBooks: ImportApprovedBooksLike,
    private readonly authorService: AuthorServiceLike,
    private readonly rootFolderService: IRootFolderService,
    private readonly mediaFileTableCleanupService: IMediaFileTableCleanupService,
    options: DiskScanServiceOptions = {}
  ) {
    this.onAuthorScanSkipped = options.onAuthorScanSkipped;
    this.onAuthorScanned = options.onAuthorScanned;
  }

  scan(
    folders?: string[],
    filter: FilterFilesType = FilterFilesType.Known,
    addNewAuthors = false,
    authorIds: number[] = []
  ): void {
    const resolvedFolders = folders ?? this.rootFolderService.all().map((r) => r.path);

    const mediaFileList: FileInfoLike[] = [];

    for (const folder of resolvedFolders) {
      // We could be scanning a root folder or a subset of a root folder. If
      // it's a subset, check if the root folder exists before cleaning.
      const rootFolder = this.rootFolderService.getBestRootFolder(folder);

      if (!rootFolder) {
        // Matches the C# source's Error-log-and-return (NOT continue --
        // this aborts the *entire* scan call, not just this folder).
        return;
      }

      const folderExists = this.diskProvider.folderExists(folder);

      if (!folderExists) {
        if (!this.diskProvider.folderExists(rootFolder.path)) {
          const skippedAuthors = this.authorService.getAuthors(authorIds);
          for (const author of skippedAuthors) {
            this.onAuthorScanSkipped?.(author, AuthorScanSkippedReason.RootFolderDoesNotExist);
          }
          return;
        }

        if (this.diskProvider.folderEmpty(rootFolder.path)) {
          const skippedAuthors = this.authorService.getAuthors(authorIds);
          for (const author of skippedAuthors) {
            this.onAuthorScanSkipped?.(author, AuthorScanSkippedReason.RootFolderIsEmpty);
          }
          return;
        }
      }

      if (!folderExists) {
        this.cleanMediaFiles(folder, []);
        continue;
      }

      const files = this.filterFiles(folder, this.getBookFiles(folder));

      if (files.length === 0) {
        continue;
      }

      this.cleanMediaFiles(
        folder,
        files.map((f) => f.fullName)
      );
      mediaFileList.push(...files);
    }

    const config: ImportDecisionMakerConfig = {
      filter,
      includeExisting: true,
      addNewAuthors,
    };

    const decisions = this.importDecisionMaker.getImportDecisions(
      mediaFileList,
      null,
      null,
      config
    );

    this.importApprovedBooks.import(decisions, false);

    // Decisions may have been filtered to just new files. Anything new and
    // approved will have been inserted. Now we need to make sure anything
    // new but not approved gets inserted. Note that knownFiles will include
    // anything imported just now.
    const knownFiles: BookFile[] = [];
    for (const folder of resolvedFolders) {
      knownFiles.push(...this.mediaFileService.getFilesWithBasePath(folder));
    }

    const knownPaths = new Set(knownFiles.map((f) => f.path));

    const newFiles: BookFile[] = decisions
      .filter((d) => !knownPaths.has(d.item.path))
      .map((decision) => ({
        id: 0,
        path: decision.item.path,
        calibreId: decision.item.calibreId,
        part: decision.item.part,
        partCount: decision.item.partCount,
        size: decision.item.size,
        modified: decision.item.modified,
        dateAdded: new Date().toISOString(),
        quality: decision.item.quality,
        mediaInfo: decision.item.fileTrackInfo.mediaInfo,
        editionId: decision.item.edition?.id ?? 0,
        edition: decision.item.edition,
        sceneName: null,
        releaseGroup: null,
        originalFilePath: null,
        indexerFlags: 0,
      }));
    this.mediaFileService.addMany(newFiles);

    // Finally update info on size/modified for existing files.
    const decisionsByPath = new Map(decisions.map((d) => [d.item.path, d.item]));
    const updatedFiles: BookFile[] = [];
    for (const file of knownFiles) {
      const item = decisionsByPath.get(file.path);
      if (!item) {
        continue;
      }
      if (
        file.size !== item.size ||
        Math.abs(new Date(file.modified).getTime() - new Date(item.modified).getTime()) > 1000
      ) {
        file.size = item.size;
        file.modified = item.modified;
        file.mediaInfo = item.fileTrackInfo.mediaInfo;
        file.quality = item.quality;
        updatedFiles.push(file);
      }
    }

    if (this.mediaFileService.updateMany) {
      this.mediaFileService.updateMany(updatedFiles);
    } else {
      for (const file of updatedFiles) {
        this.mediaFileService.update(file);
      }
    }

    const authors = this.authorService.getAuthors(authorIds);
    for (const author of authors) {
      this.onAuthorScanned?.(author);
    }
  }

  private cleanMediaFiles(folder: string, mediaFileList: string[]): void {
    this.mediaFileTableCleanupService.clean(folder, mediaFileList);
  }

  getBookFiles(path: string, allDirectories = true): FileInfoLike[] {
    let filesOnDisk: FileInfoLike[];

    const rootFolder = this.rootFolderService.getBestRootFolder(path);

    if (rootFolder?.isCalibreLibrary && rootFolder.calibreSettings) {
      // Calibre integration is out of scope for this port -- see this
      // file's module doc comment. The real C# source would fetch the
      // calibre file listing here; no caller of this port exercises that
      // branch (every RootFolder has isCalibreLibrary: false), so it
      // falls through to an empty result rather than throwing, matching
      // "no calibre files found" rather than a hard error.
      filesOnDisk = [];
    } else {
      filesOnDisk = this.diskProvider.getFileInfos(path, allDirectories);
    }

    return filesOnDisk.filter((file) => MediaFileExtensions.AllExtensions.has(file.extension));
  }

  getNonBookFiles(path: string, allDirectories = true): string[] {
    const filesOnDisk = this.diskProvider.getFiles(path, allDirectories);

    return filesOnDisk.filter((file) => !MediaFileExtensions.AllExtensions.has(extname(file)));
  }

  filterPaths(basePath: string, paths: string[]): string[] {
    return paths
      .filter(
        (file) => !new RegExp(EXCLUDED_SUB_FOLDERS_REGEX).test(getRelativePath(basePath, file))
      )
      .filter((file) => !new RegExp(EXCLUDED_FILES_REGEX).test(baseName(file)));
  }

  filterFiles(basePath: string, files: FileInfoLike[]): FileInfoLike[] {
    return files
      .filter(
        (file) =>
          !new RegExp(EXCLUDED_SUB_FOLDERS_REGEX).test(getRelativePath(basePath, file.fullName))
      )
      .filter((file) => !new RegExp(EXCLUDED_FILES_REGEX).test(file.name));
  }

  /** Ported from `Execute(RescanFoldersCommand message)`. See module doc comment on the Messaging-module deviation. */
  executeRescanFolders(
    folders: string[] | undefined,
    filter: FilterFilesType,
    addNewAuthors: boolean,
    authorIds: number[]
  ): void {
    this.scan(folders, filter, addNewAuthors, authorIds);
  }
}

/** Ported from `basePath.GetRelativePath(file)` as used by FilterFiles/FilterPaths. */
function getRelativePath(basePath: string, targetPath: string): string {
  const normalizedBase = basePath.replace(/[/\\]+$/, "");
  if (
    isParentPath(normalizedBase, targetPath) ||
    targetPath.startsWith(`${normalizedBase}/`) ||
    targetPath.startsWith(`${normalizedBase}\\`)
  ) {
    return targetPath.slice(normalizedBase.length + 1);
  }
  return targetPath;
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
