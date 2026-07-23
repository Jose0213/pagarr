import type { BookFile } from "./types.js";

/** Ported from NzbDrone.Core/MediaFiles/RenamedBookFile.cs. */
export interface RenamedBookFile {
  bookFile: BookFile;
  previousPath: string;
}
