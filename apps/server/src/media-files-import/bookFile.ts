import type { ModelBase } from "../db/model-base.js";
import type { Author, Edition } from "../books/index.js";
import type { QualityModel } from "../qualities/index.js";
import { IndexerFlags } from "../parser/model/releaseInfo.js";
import type { MediaInfoModel } from "../parser/model/mediaInfoModel.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookFile.cs. Backing table: BookFiles
 * (migration 0001 + 0010's Part column).
 *
 * `Author`/`Edition` are C# `LazyLoaded<T>` DB-relation fields -- ported as
 * plain optional properties per `books/models.ts`'s established convention
 * for LazyLoaded fields (see that file's module doc comment): populated
 * explicitly by callers (e.g. `MediaFileRepository`'s join-query methods),
 * not auto-fetched.
 */
export interface BookFile extends ModelBase {
  path: string;
  size: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  modified: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  dateAdded: string;
  originalFilePath: string | null;
  sceneName: string | null;
  releaseGroup: string | null;
  quality: QualityModel;
  indexerFlags: IndexerFlags;
  mediaInfo: MediaInfoModel | null;
  editionId: number;
  calibreId: number;
  part: number;

  // Dynamically-populated relations (see module doc comment).
  author?: Author;
  edition?: Edition;

  // Calculated manually (not a DB column -- see MediaFileTableCleanupService
  // in the real source for the one caller that populates this).
  partCount: number;
}

export function newBookFile(): Omit<BookFile, keyof ModelBase> & { id: number } {
  return {
    id: 0,
    path: "",
    size: 0,
    modified: new Date(0).toISOString(),
    dateAdded: new Date(0).toISOString(),
    originalFilePath: null,
    sceneName: null,
    releaseGroup: null,
    quality: undefined as unknown as QualityModel,
    indexerFlags: 0 as IndexerFlags,
    mediaInfo: null,
    editionId: 0,
    calibreId: 0,
    part: 0,
    partCount: 0,
  };
}

/** Ported from `BookFile.ToString()`: "[{Id}] {Path}". */
export function bookFileToString(bookFile: BookFile): string {
  return `[${bookFile.id}] ${bookFile.path}`;
}

/**
 * Ported from `BookFile.GetSceneOrFileName()`: prefers SceneName, falls
 * back to the file name (without extension) from Path, or "" if both are
 * blank.
 */
export function getSceneOrFileName(bookFile: BookFile): string {
  if (bookFile.sceneName !== null && bookFile.sceneName.trim() !== "") {
    return bookFile.sceneName;
  }

  if (bookFile.path.trim() !== "") {
    return fileNameWithoutExtension(bookFile.path);
  }

  return "";
}

/** Ported from `System.IO.Path.GetFileNameWithoutExtension(Path)`. */
function fileNameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.substring(0, dotIndex) : base;
}
