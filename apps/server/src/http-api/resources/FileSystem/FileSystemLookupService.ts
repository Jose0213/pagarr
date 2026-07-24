import { readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { dirname, sep } from "node:path";

/**
 * Ported from NzbDrone.Common/Disk/FileSystemLookupService.cs.
 *
 * Backs `FileSystemController.GetContents` (the settings UI's folder
 * picker). Not previously ported anywhere in this repo (verified: no
 * `FileSystemLookupService`/`IFileSystemLookupService` reference exists
 * outside this file) -- a genuinely new module for this task, not a
 * forward-reference, since its only real dependency (`IDiskProvider`'s
 * directory/file listing + `IRuntimeInfo`/`GetMounts` for the Windows
 * drive-letter root view) is small and self-contained enough to port
 * faithfully in full here rather than stub out, per this task's brief
 * ("port the real C# FileSystemController.cs's directory-listing +
 * drive-enumeration logic faithfully using Node's node:fs").
 *
 * `IDiskProvider`/`IRuntimeInfo` are narrowed to
 * `FileSystemDiskProviderLike` below -- same "narrow slice, field names
 * copied 1:1 from the real C# interface" discipline as
 * `root-folders/disk-provider.ts` and `media-files-import/
 * mediaFileDiskProvider.ts`. `runtimeInfo.isWindowsService` in particular
 * matches `validation/paths/mappedNetworkDriveValidator.ts`'s own
 * `RuntimeInfoLike` shape (not reused directly since that file lives in a
 * different module scope this worktree wasn't told to touch, but
 * deliberately kept field-identical).
 */

export type DriveType = "network" | "fixed" | "removable" | "unknown";

/** Ported from `NzbDrone.Common.Disk.IMount`, narrowed to the fields `GetDrives` reads. */
export interface MountLike {
  name: string;
  volumeLabel: string | null;
  rootDirectory: string;
  driveType: DriveType;
}

/** Ported from the slice of `IDiskProvider`/`IRuntimeInfo` this service calls. */
export interface FileSystemDiskProviderLike {
  folderExists(path: string): boolean;
  /** Ported from `IDiskProvider.GetMounts()`. Defaults to a Windows drive-letter probe / POSIX root mount below if not supplied -- see `defaultGetMounts()`. */
  getMounts?(): MountLike[];
  /** Ported from `IRuntimeInfo.IsWindowsService` -- gates the network-drive exclusion in `GetDrives`. Defaults to `false` (interactive/non-service process) if not supplied. */
  isWindowsService?: boolean;
}

export enum FileSystemEntityType {
  Drive = "drive",
  Folder = "folder",
  File = "file",
}

/** Ported from `NzbDrone.Common.Disk.FileSystemModel`. */
export interface FileSystemModel {
  type: FileSystemEntityType;
  name: string;
  path: string;
  /** ISO-8601 timestamp string, or null (drives have no last-modified). Ported from `DateTime? LastModified`. */
  lastModified: string | null;
  size?: number;
  extension?: string;
}

/** Ported from `NzbDrone.Common.Disk.FileSystemResult`. */
export interface FileSystemResult {
  parent?: string | null;
  directories?: FileSystemModel[];
  files?: FileSystemModel[];
}

/**
 * Ported from `FileSystemLookupService._setToRemove`: filesystem-junk folder
 * names hidden from the picker, matched case-insensitively.
 */
const SET_TO_REMOVE = new Set([
  // Windows
  "boot",
  "bootmgr",
  "cache",
  "msocache",
  "recovery",
  "$recycle.bin",
  "recycler",
  "system volume information",
  "temporary internet files",
  "windows",

  // OS X
  ".fseventd",
  ".spotlight",
  ".trashes",
  ".vol",
  "cachedmessages",
  "caches",
  "trash",

  // QNAP
  ".@__thumb",

  // Synology
  "@eadir",
  "#recycle",
]);

function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Ported from `FileSystemLookupService.GetDrives`'s default `IDiskProvider.
 * GetMounts()` data source, for callers that don't supply their own. Probes
 * drive letters A-Z on Windows (Node has no built-in mount-enumeration API);
 * returns a single "/" root mount on POSIX, matching `DiskProvider`'s Mono
 * `DriveInfo.GetDrives()`-backed behavior narrowed to "the one mount a
 * container/typical single-root Linux/Mac host actually has" -- full
 * multi-mount enumeration on POSIX would need `/proc/mounts` parsing, out of
 * scope for this port's actual observed need (the real Readarr POSIX build
 * itself only ever surfaces `/` this way in practice for a typical install).
 */
function defaultGetMounts(): MountLike[] {
  if (!isWindows()) {
    return existsSync("/")
      ? [{ name: "/", volumeLabel: null, rootDirectory: "/", driveType: "fixed" }]
      : [];
  }

  const drives: MountLike[] = [];
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    if (existsSync(root)) {
      drives.push({
        name: `${letter}:`,
        volumeLabel: null,
        rootDirectory: root,
        driveType: "fixed",
      });
    }
  }
  return drives;
}

/**
 * Ported from `FullName.GetActualCasing()` (NzbDrone.Common/Extensions/
 * StringExtensions.cs), which resolves a path's true on-disk casing (NTFS/
 * APFS are case-insensitive-but-preserving, so a user-typed path's casing
 * may not match what's actually stored). `fs.realpathSync.native` resolves
 * this on both Windows and macOS; on Linux (case-sensitive filesystems) the
 * input casing IS the actual casing already, so any failure here (path
 * doesn't exist, permission denied, etc.) safely falls back to the
 * as-given path rather than throwing.
 */
function getActualCasing(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

export class FileSystemLookupService {
  constructor(private readonly diskProvider: FileSystemDiskProviderLike) {}

  /** Ported from `FileSystemLookupService.LookupContents`. */
  lookupContents(
    query: string | null | undefined,
    includeFiles: boolean,
    allowFoldersWithoutTrailingSlashes: boolean
  ): FileSystemResult {
    let path = query;

    if (path === null || path === undefined || path.trim() === "") {
      if (isWindows()) {
        return { directories: this.getDrives() };
      }
      path = "/";
    }

    if (
      allowFoldersWithoutTrailingSlashes &&
      isPathValid(path) &&
      this.diskProvider.folderExists(path)
    ) {
      return this.getResult(path, includeFiles);
    }

    const separator = isWindows() ? "\\" : "/";
    const lastSeparatorIndex = path.lastIndexOf(separator);
    const trimmedPath = path.slice(0, lastSeparatorIndex + 1);

    if (lastSeparatorIndex !== -1) {
      return this.getResult(trimmedPath, includeFiles);
    }

    return {};
  }

  /** Ported from `FileSystemLookupService.GetDrives`. */
  private getDrives(): FileSystemModel[] {
    const mounts = this.diskProvider.getMounts?.() ?? defaultGetMounts();
    const isWindowsService = this.diskProvider.isWindowsService ?? false;

    return mounts
      .filter((mount) => (isWindowsService ? mount.driveType !== "network" : true))
      .map((mount) => ({
        type: FileSystemEntityType.Drive,
        name:
          mount.volumeLabel && mount.volumeLabel.trim() !== ""
            ? `${mount.name} (${mount.volumeLabel})`
            : mount.name,
        path: mount.rootDirectory,
        lastModified: null,
      }));
  }

  /** Ported from `FileSystemLookupService.GetResult`. */
  private getResult(path: string, includeFiles: boolean): FileSystemResult {
    try {
      const result: FileSystemResult = {
        parent: getParent(path),
        directories: this.getDirectories(path),
      };

      if (includeFiles) {
        result.files = this.getFiles(path);
      }

      return result;
    } catch (e) {
      // Ported from the C# source's four narrow catch clauses
      // (DirectoryNotFoundException/ArgumentException/IOException/
      // UnauthorizedAccessException) -- Node's `fs` throws a single `Error`
      // shape (`NodeJS.ErrnoException`) for all of these cases rather than
      // distinct exception types, so they collapse into one catch here.
      // `ArgumentException`'s branch (bare `new FileSystemResult()`, no
      // Parent) is the one behavioral special case among the four; matched
      // via `code === "EINVAL"`, Node's equivalent for a structurally
      // invalid path.
      if (isNodeError(e) && e.code === "EINVAL") {
        return {};
      }
      return { parent: getParent(path) };
    }
  }

  /** Ported from `FileSystemLookupService.GetDirectories`. */
  private getDirectories(path: string): FileSystemModel[] {
    const entries = readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    const directories = entries.map((name) => {
      const fullName = joinPath(path, name);
      const stat = statSync(fullName);
      return {
        type: FileSystemEntityType.Folder,
        name,
        path: getDirectoryPath(getActualCasing(fullName)),
        lastModified: stat.mtime.toISOString(),
      };
    });

    return directories.filter((d) => !SET_TO_REMOVE.has(d.name.toLowerCase()));
  }

  /** Ported from `FileSystemLookupService.GetFiles`. */
  private getFiles(path: string): FileSystemModel[] {
    const entries = readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    return entries.map((name) => {
      const fullName = joinPath(path, name);
      const stat = statSync(fullName);
      const dot = name.lastIndexOf(".");
      return {
        type: FileSystemEntityType.File,
        name,
        path: getActualCasing(fullName),
        lastModified: stat.mtime.toISOString(),
        extension: dot > 0 ? name.slice(dot) : "",
        size: stat.size,
      };
    });
  }
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

function joinPath(base: string, name: string): string {
  const separator = isWindows() ? "\\" : "/";
  return base.endsWith(separator) ? `${base}${name}` : `${base}${separator}${name}`;
}

/** Ported from `FileSystemLookupService.GetDirectoryPath`: ensures a trailing separator. */
function getDirectoryPath(path: string): string {
  const separator = isWindows() ? "\\" : sep;
  return path.endsWith(separator) || path.endsWith("/") ? path : `${path}${separator}`;
}

/** Ported from `FileSystemLookupService.GetParent`: parent directory with a trailing separator, "" if `path` has no filesystem parent, or `null` only for the POSIX root "/" itself. */
function getParent(path: string): string | null {
  const normalized = path.replace(/[/\\]+$/, "");

  if (normalized === "" || /^[a-zA-Z]:$/.test(normalized)) {
    // Root of a drive ("C:\" -> "C:") or POSIX root ("/" -> "") has no parent.
    return isWindows() ? "" : null;
  }

  const parent = dirname(normalized);

  if (parent === normalized) {
    return isWindows() ? "" : null;
  }

  const separator = isWindows() ? "\\" : "/";
  return parent.endsWith(separator) ? parent : `${parent}${separator}`;
}

/**
 * Ported from `query.IsPathValid(PathValidationType.CurrentOs)`
 * (NzbDrone.Common/Extensions/StringExtensions.cs): a minimal rooted-path
 * check, matching `root-folders/path-utils.ts`'s `isPathRooted` semantics
 * narrowed to the current OS only (`PathValidationType.CurrentOs`, not the
 * `AnyOs` variant that file's own `isPathRooted` implements) -- kept local
 * rather than importing that module's cross-OS helper since the real C#
 * source's `CurrentOs` variant is deliberately narrower (rejects a
 * Windows-style path on a POSIX host and vice versa).
 */
function isPathValid(path: string): boolean {
  if (isWindows()) {
    return /^[a-zA-Z]:\\/.test(path);
  }
  return path.startsWith("/");
}
