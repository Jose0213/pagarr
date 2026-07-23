import type { BookFile } from "./bookFile.js";

/** Ported from NzbDrone.Core/MediaFiles/BookFileMoveResult.cs. */
export interface BookFileMoveResult {
  bookFile: BookFile;
  oldFiles: BookFile[];
}

/** Ported from the `BookFileMoveResult()` constructor: OldFiles defaults to an empty list. */
export function newBookFileMoveResult(
  bookFile: BookFile,
  oldFiles: BookFile[] = []
): BookFileMoveResult {
  return { bookFile, oldFiles };
}
