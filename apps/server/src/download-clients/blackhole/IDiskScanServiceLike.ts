/**
 * Forward-ref for the slice of NzbDrone.Core/MediaFiles/IDiskScanService.cs
 * (`DiskScanService`) that `ScanWatchFolder` calls: `FilterPaths`,
 * `FilterFiles`, `GetBookFiles`. `MediaFiles` is a sibling not-yet-ported
 * module (the "download-tracking" worktree's neighbor, per this task's
 * cross-worktree forward-reference guidance) -- out of this worktree's
 * scope entirely.
 *
 * Files are represented as plain `{ name, fullName, length, lastWriteTimeMs }`
 * objects (the fields `ScanWatchFolder.cs` actually reads off C#'s
 * `IFileInfo`), not a full filesystem-abstraction wrapper type.
 *
 * `FilterPaths`/`FilterFiles`' exclusion regexes
 * (`ExcludedSubFoldersRegex`/`ExcludedFilesRegex`, declared as public static
 * fields directly on `DiskScanService` in the real C# source) are ported
 * here verbatim rather than stubbed, since watch-folder scanning without
 * them would pick up `.partial~`/`Thumbs.db`/`@eaDir` junk files as real
 * downloads -- genuinely load-bearing filtering behavior, not
 * `DiskScanService`-internal plumbing.
 */
export interface DiskScanFileInfo {
  name: string;
  fullName: string;
  length: number;
  /** Milliseconds since epoch, matching C#'s `DateTime LastWriteTimeUtc`. */
  lastWriteTimeMs: number;
}

export interface IDiskScanServiceLike {
  getBookFiles(
    path: string,
    allDirectories?: boolean
  ): Promise<DiskScanFileInfo[]> | DiskScanFileInfo[];
  filterFiles(basePath: string, files: DiskScanFileInfo[]): DiskScanFileInfo[];
  filterPaths(basePath: string, paths: string[]): string[];
}

/** Ported from `DiskScanService.ExcludedSubFoldersRegex`. */
export const EXCLUDED_SUB_FOLDERS_REGEX =
  /(?:\\|\/|^)(?:extras|@eadir|extrafanart|plex versions|\.[^\\/]+)(?:\\|\/)/i;

/** Ported from `DiskScanService.ExcludedFilesRegex`. */
export const EXCLUDED_FILES_REGEX = /^\._|^Thumbs\.db$|^\.DS_store$|\.partial~$/i;

/** Ported from PathExtensions.GetRelativePath (the slice ScanWatchFolder's callers actually rely on: strip the parent prefix, trim separators). */
export function getRelativePath(parentPath: string, childPath: string): string {
  if (!childPath.startsWith(parentPath)) {
    return childPath;
  }
  return childPath.slice(parentPath.length).replace(/^[\\/]+|[\\/]+$/g, "");
}
