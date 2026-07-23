import type { IRootFolderService } from "../root-folders/root-folder-service.js";
import { RootFolderNotFoundException } from "./errors.js";
import type { IMoveBookFiles } from "./bookFileMovingService.js";
import type { IExtendedDiskProvider } from "./diskProvider.js";
import type { IRecycleBinProvider } from "./recycleBinProvider.js";
import {
  DeleteMediaFileReason,
  type BookFile,
  type CalibreProxyLike,
  type LocalBookLike,
  type MediaFileServiceLike,
} from "./types.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/UpgradeMediaFileService.cs.
 *
 * `IMetadataTagService.WriteTags` (real owner: `media-files-tags`, sibling
 * worktree not merged) is a forward-reference declared locally as
 * `MetadataTagServiceLike` -- only the `writeTags(bookFile, newDownload)`
 * call this class makes is captured.
 *
 * Calibre branches (`ICalibreProxy`) are ported for structural fidelity
 * (see types.ts's `CalibreProxyLike` doc comment on why they're dead code
 * in practice for this port -- every RootFolder here has
 * `isCalibreLibrary: false`).
 */
export interface MetadataTagServiceLike {
  writeTags(bookFile: BookFile, newDownload: boolean): void;
}

export interface BookFileMoveResult {
  bookFile: BookFile;
  oldFiles: BookFile[];
}

export interface IUpgradeMediaFiles {
  upgradeBookFile(
    bookFile: BookFile,
    localBook: LocalBookWithExistingFiles,
    copyOnly?: boolean
  ): BookFileMoveResult;
}

/**
 * Ported from `LocalBook.Book.BookFiles.Value` (the `existingFiles` the
 * real C# source reads off `localBook.Book`). Extends `LocalBookLike`
 * (types.ts) with the one additional field this service needs:
 * `book.bookFiles` -- kept as a caller-supplied field here rather than
 * added to the shared `LocalBookLike` shape, since no other service in this
 * module needs it (see types.ts's own doc comment on keeping forward-ref
 * shapes minimal to what's actually read).
 */
export interface LocalBookWithExistingFiles extends LocalBookLike {
  book: LocalBookLike["book"] & { bookFiles: BookFile[] };
}

export class UpgradeMediaFileService implements IUpgradeMediaFiles {
  constructor(
    private readonly recycleBinProvider: IRecycleBinProvider,
    private readonly mediaFileService: MediaFileServiceLike,
    private readonly metadataTagService: MetadataTagServiceLike,
    private readonly bookFileMover: IMoveBookFiles,
    private readonly diskProvider: IExtendedDiskProvider,
    private readonly rootFolderService: IRootFolderService,
    private readonly calibre: CalibreProxyLike
  ) {}

  upgradeBookFile(
    bookFile: BookFile,
    localBook: LocalBookWithExistingFiles,
    copyOnly = false
  ): BookFileMoveResult {
    const moveFileResult: BookFileMoveResult = { bookFile: bookFile, oldFiles: [] };
    const existingFiles = localBook.book.bookFiles;

    const rootFolderPath = dirnameOf(localBook.author.path);
    const rootFolder = this.rootFolderService.getBestRootFolder(rootFolderPath);

    // Ported verbatim: the C# source does NOT null-check `rootFolder` here
    // (`GetBestRootFolder` can return null -- see
    // root-folders/root-folder-service.ts's `RootFolder | undefined`
    // signature -- and `rootFolder.IsCalibreLibrary` would throw a real
    // NullReferenceException in that case). This is a genuine bug in the
    // original, faithfully reproduced (not fixed) per this port's
    // "port precisely, patch later" discipline -- the throw below matches
    // accessing `.isCalibreLibrary`/`.calibreSettings` on undefined.
    const isCalibre = rootFolder!.isCalibreLibrary && rootFolder!.calibreSettings != null;
    const settings = rootFolder!.calibreSettings;

    // If there are existing book files and the root folder is missing, throw, so the old file isn't left behind during the import process.
    if (existingFiles.length > 0 && !this.diskProvider.folderExists(rootFolderPath)) {
      throw new RootFolderNotFoundException(`Root folder '${rootFolderPath}' was not found.`);
    }

    for (const file of existingFiles) {
      const bookFilePath = file.path;
      const subfolder = relativePath(rootFolderPath, dirnameOf(bookFilePath));

      bookFile.calibreId = file.calibreId;

      if (this.diskProvider.fileExists(bookFilePath)) {
        if (!isCalibre) {
          this.recycleBinProvider.deleteFile(bookFilePath, subfolder);
        } else {
          const existing = this.calibre.getBook(file.calibreId, settings);
          const existingFormats = Object.keys(existing.formats);
          this.calibre.removeFormats(file.calibreId, existingFormats, settings);
        }
      }

      moveFileResult.oldFiles.push(file);
      this.mediaFileService.delete(file, DeleteMediaFileReason.Upgrade);
    }

    if (!isCalibre) {
      if (copyOnly) {
        moveFileResult.bookFile = this.bookFileMover.copyBookFile(bookFile, localBook);
      } else {
        moveFileResult.bookFile = this.bookFileMover.moveBookFileForImport(bookFile, localBook);
      }

      this.metadataTagService.writeTags(moveFileResult.bookFile, true);
    } else {
      const source = bookFile.path;

      moveFileResult.bookFile = this.calibre.addAndConvert(bookFile, settings);

      if (!copyOnly) {
        this.diskProvider.deleteFile(source);
      }
    }

    return moveFileResult;
  }
}

function dirnameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Ported from `rootFolderPath.GetRelativePath(...)` as used here. */
function relativePath(basePath: string, targetPath: string): string {
  const normalizedBase = basePath.replace(/[/\\]+$/, "");
  if (targetPath.startsWith(`${normalizedBase}/`) || targetPath.startsWith(`${normalizedBase}\\`)) {
    return targetPath.slice(normalizedBase.length + 1);
  }
  return targetPath;
}
