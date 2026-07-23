import type { QualityModel } from "../../../qualities/qualityModel.js";
import { pathEquals } from "../../../root-folders/path-utils.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Manual/ManualImportFile.cs. */
export interface ManualImportFile {
  path: string;
  authorId: number;
  bookId: number;
  foreignEditionId: string;
  quality: QualityModel;
  indexerFlags: number;
  downloadId: string | null;
  disableReleaseSwitching: boolean;
}

/** Ported from `ManualImportFile.Equals`/`GetHashCode`: identity is entirely path-based (OS-aware comparison), matching the C# source's `IEquatable<ManualImportFile>` implementation. */
export function manualImportFilesEqual(a: ManualImportFile, b: ManualImportFile): boolean {
  return pathEquals(a.path, b.path);
}
