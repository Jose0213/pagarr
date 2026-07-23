import type { Author, Book, Edition } from "../books/models.js";
import type { IndexerFlags } from "../custom-formats/indexerFlags.js";
import type { BookFileLike } from "./organizer/fileNameBuilder.js";

/**
 * Forward-references for the `media-files-import` module (owns
 * `BookFile`/`MediaFileService`/`LocalBook`, real C# sources
 * `NzbDrone.Core/MediaFiles/BookFile.cs`, `MediaFileService.cs`,
 * `MediaFiles/BookImport/LocalBook.cs`) and `media-files-tags` (owns tag
 * writing, real C# source `MediaFiles/MetadataTagService.cs`). Per this
 * module's task brief, these sibling worktrees are being ported in
 * parallel and are NOT importable here. Every shape below is copied
 * field-for-field from the real C# class it stands in for, so the eventual
 * swap to real imports (once those worktrees merge) should be mechanical --
 * same pattern this repo already established in decision-engine/
 * remoteBook.ts and custom-formats/customFormatCalculationService.ts (see
 * their header comments for the precedent).
 */

/**
 * Forward-ref for the full NzbDrone.Core/MediaFiles/BookFile.cs model (a
 * superset of organizer/fileNameBuilder.ts's `BookFileLike`, which only
 * declares the fields the naming-template engine itself reads). This is the
 * shape RenameBookFileService/BookFileMovingService/UpgradeMediaFileService/
 * MediaFileTableCleanupService/DiskScanService actually operate on --
 * `id`/`editionId`/`calibreId`/`author`/`edition` (the DB-relation/queried
 * fields) plus everything BookFileLike already covers.
 */
export interface BookFile extends BookFileLike {
  id: number;
  size: number;
  modified: string;
  dateAdded: string;
  originalFilePath: string | null;
  indexerFlags: IndexerFlags | number;
  editionId: number;
  calibreId: number;
  author?: Author;
  edition?: Edition;
}

/** Ported from `BookFile.ToString()`: "[{Id}] {Path}". */
export function bookFileToString(bookFile: BookFile): string {
  return `[${bookFile.id}] ${bookFile.path}`;
}

/** Ported from `BookFile.GetSceneOrFileName()`. */
export function getSceneOrFileName(bookFile: BookFile): string {
  if (bookFile.sceneName !== null && bookFile.sceneName.trim() !== "") {
    return bookFile.sceneName;
  }

  if (bookFile.path.trim() !== "") {
    const base = bookFile.path.split(/[/\\]/).pop() ?? "";
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
  }

  return "";
}

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/IMediaFileService.cs this module's services call. */
export interface MediaFileServiceLike {
  getFilesByAuthor(authorId: number): BookFile[];
  getFilesByBook(bookId: number): BookFile[];
  getFilesWithBasePath(basePath: string): BookFile[];
  get(ids: number[]): BookFile[];
  update(bookFile: BookFile): void;
  updateMany?(bookFiles: BookFile[]): void;
  delete(bookFile: BookFile, reason: DeleteMediaFileReason): void;
  deleteMany(bookFiles: BookFile[], reason: DeleteMediaFileReason): void;
  addMany(bookFiles: BookFile[]): void;
}

/** Ported from NzbDrone.Core/MediaFiles/DeleteMediaFileReason.cs. */
export enum DeleteMediaFileReason {
  NoLongerExists = 0,
  Manual = 1,
  Upgrade = 2,
  FileDeletedByUser = 3,
  MissingFromDisk = 4,
}

/**
 * Forward-ref for NzbDrone.Core/MediaFiles/BookImport/LocalBook.cs -- the
 * slice BookFileMovingService/UpgradeMediaFileService read: `Path`,
 * `Author`, `Book`, `Edition`.
 */
export interface LocalBookLike {
  path: string;
  author: Author;
  book: Book;
  edition: Edition;
}

/** Forward-ref for the Books module's not-yet-exposed `IEditionService.GetEdition(id)` lookup BookFileMovingService needs. */
export interface EditionServiceLike {
  getEdition(id: number): Edition;
}

/**
 * Forward-ref for `NzbDrone.Core/Books/Calibre/ICalibreProxy.cs` -- the
 * slice UpgradeMediaFileService/DiskScanService call. Calibre integration
 * itself is out of scope for this port (no calibre-specific worktree in
 * PORT_PLAN.md's Phase 3 list); every real root folder this port creates
 * has `isCalibreLibrary: false` (see root-folders/root-folder.ts), so these
 * calibre branches are dead code paths in practice but are still ported
 * faithfully (not stripped) per this module's task brief -- a caller could
 * wire a real implementation later without changing this module's control
 * flow.
 */
export interface CalibreProxyLike {
  getBook(calibreId: number, settings: unknown): { formats: Record<string, unknown> };
  removeFormats(calibreId: number, formats: Iterable<string>, settings: unknown): void;
  addAndConvert(bookFile: BookFile, settings: unknown): BookFile;
  getAllBookFilePaths(settings: unknown): string[];
}

/** Forward-ref for the slice of NzbDrone.Core/RootFolders/RootFolderService.cs's `RootFolder` model this module reads (root-folders/root-folder.ts's real `RootFolder` already covers this -- kept here only as a doc pointer, not a redeclaration). */
export type { RootFolder } from "../root-folders/root-folder.js";
