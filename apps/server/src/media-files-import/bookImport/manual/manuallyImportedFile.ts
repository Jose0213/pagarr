import type { ImportResult } from "../importResult.js";
import type { TrackedDownloadLike } from "./trackedDownloadLike.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Manual/ManuallyImportedFile.cs. */
export interface ManuallyImportedFile {
  trackedDownload: TrackedDownloadLike;
  importResult: ImportResult;
}
