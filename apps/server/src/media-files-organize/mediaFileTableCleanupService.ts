import { pathEquals } from "../root-folders/path-utils.js";
import { DeleteMediaFileReason, type MediaFileServiceLike } from "./types.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/MediaFileTableCleanupService.cs.
 *
 * `PathEqualityComparer.Instance` (NzbDrone.Common) is used by the C# source
 * for the `ExceptBy` comparison -- ported here using
 * root-folders/path-utils.ts's real `pathEquals` (the same OS-aware,
 * case-insensitive-on-Windows path comparison this port already
 * established), rather than a plain string `!==` check.
 */
export interface IMediaFileTableCleanupService {
  clean(folder: string, filesOnDisk: string[]): void;
}

export class MediaFileTableCleanupService implements IMediaFileTableCleanupService {
  constructor(private readonly mediaFileService: MediaFileServiceLike) {}

  clean(folder: string, filesOnDisk: string[]): void {
    const dbFiles = this.mediaFileService.getFilesWithBasePath(folder);

    // Get files in database that are missing on disk and remove from database.
    const missingFiles = dbFiles.filter(
      (dbFile) => !filesOnDisk.some((diskPath) => pathEquals(dbFile.path, diskPath))
    );

    this.mediaFileService.deleteMany(missingFiles, DeleteMediaFileReason.MissingFromDisk);
  }
}
