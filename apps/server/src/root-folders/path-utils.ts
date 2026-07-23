import { isAbsolute } from "node:path";

/**
 * Ported from the slice of NzbDrone.Common/Extensions/PathExtensions.cs that
 * RootFolderService (and the RootFolder path validators) actually use:
 * PathEquals, IsParentPath, GetCleanPath, plus the `Path.IsPathRooted` check
 * from RootFolderService.VerifyRootFolder.
 *
 * Deviation: the C# original branches path-comparison case-sensitivity on
 * `DiskProviderBase.PathStringComparison`, which is `OrdinalIgnoreCase` on
 * Windows and `Ordinal` elsewhere (i.e. it follows the OS Pagarr is actually
 * *running* on, not the path string's own apparent flavor). This ports the
 * same rule via Node's `process.platform`, matching Readarr's actual
 * behavior on a self-hosted, single-OS-at-a-time instance (as opposed to
 * porting the full `OsPath`/`PathValidationType.AnyOs` dual-OS path-kind
 * detection used elsewhere in Readarr for cross-platform remote-path
 * mapping, which is out of scope for this module -- RemotePathMappings is
 * its own not-yet-ported Phase 3 module).
 */

/**
 * Read live (not cached at module load) so callers/tests can simulate the
 * other OS's comparison rules by stubbing `process.platform` -- matching
 * C#'s `DiskProviderBase.PathStringComparison`, which is itself a property
 * evaluated fresh on every access rather than a value fixed at startup.
 */
function isCaseInsensitive(): boolean {
  return process.platform === "win32";
}

function normalizeForComparison(path: string): string {
  return isCaseInsensitive() ? path.toLowerCase() : path;
}

/** Ported from PathExtensions.CleanFilePathBasic (the part GetCleanPath/PathEquals actually rely on). */
function cleanFilePathBasic(path: string): string {
  // UNC path: leave leading slashes alone, just trim trailing separators/spaces.
  if (!path.includes("/") && path.startsWith("\\\\")) {
    return path.replace(/[/\\ ]+$/, "");
  }

  if (!isCaseInsensitive() && path.replace(/\/+$/, "").length === 0) {
    return "/";
  }

  return path.replace(/\/+$/, "").replace(/^[\\ ]+|[\\ ]+$/g, "");
}

/**
 * Ported from PathExtensions.GetCleanPath. C# branches on `OsInfo.IsWindows`
 * (the actual running OS, same as isCaseInsensitive() above) to decide
 * whether to strip a trailing `\` (Windows, preserving the "C:\" drive
 * root) or a trailing `/` (non-Windows) -- deliberately not `node:path`'s
 * `sep`, which reflects the real host OS and wouldn't respond to a
 * `process.platform` stub the way the rest of this module's OS-branching
 * does (see isCaseInsensitive()'s doc comment).
 */
export function getCleanPath(path: string): string {
  if (isCaseInsensitive()) {
    // C#: Regex `(?<!:)\\$` -- strip one trailing backslash unless it's the
    // drive-root separator ("C:\").
    return path.replace(/(?<!:)\\$/, "");
  }
  return path.replace(/\/$/, "");
}

/** Ported from PathExtensions.PathEquals. */
export function pathEquals(firstPath: string, secondPath: string): boolean {
  if (normalizeForComparison(firstPath) === normalizeForComparison(secondPath)) {
    return true;
  }

  return normalizeForComparison(cleanFilePathBasic(firstPath)) === normalizeForComparison(cleanFilePathBasic(secondPath));
}

/**
 * Ported from PathExtensions.IsParentPath. C# walks up `childPath`'s
 * `DirectoryInfo.Parent` chain comparing `FullName` against `parentPath`
 * (i.e. it answers "is parentPath an ancestor at any depth", not just the
 * immediate parent) -- this walks the same way over path segments rather
 * than touching the real filesystem, since RootFolders' own paths may not
 * exist yet at validation time.
 */
export function isParentPath(parentPath: string, childPath: string): boolean {
  const trimTrailingSep = (p: string): string => {
    if (p === "/" || /^[a-zA-Z]:\\$/.test(p)) {
      return p;
    }
    return p.replace(/[/\\]+$/, "");
  };

  const normalizedParent = trimTrailingSep(parentPath);
  const normalizedChild = trimTrailingSep(childPath);

  const parentSegments = splitSegments(normalizedParent);
  const childSegments = splitSegments(normalizedChild);

  if (childSegments.length <= parentSegments.length) {
    return false;
  }

  const ancestorSegments = childSegments.slice(0, parentSegments.length);
  return (
    ancestorSegments.length === parentSegments.length &&
    ancestorSegments.every((seg, i) => normalizeForComparison(seg) === normalizeForComparison(parentSegments[i]!))
  );
}

function splitSegments(path: string): string[] {
  return path.split(/[/\\]+/).filter((s) => s.length > 0);
}

/**
 * Ported from `Path.IsPathRooted(rootFolder.Path)` in
 * RootFolderService.VerifyRootFolder. .NET's `Path.IsPathRooted` returns
 * true for both `/foo` (Unix) and `C:\foo` / `\\server\share` (Windows) --
 * it does not require the path to be rooted for the *current* OS the way
 * Node's `path.isAbsolute` does (which only recognizes the current
 * platform's own convention). This checks both conventions explicitly to
 * match .NET's OS-agnostic behavior, so e.g. a Windows-authored Pagarr
 * config validated on a Linux host still rejects/accepts rootedness the
 * same way Readarr would have.
 */
export function isPathRooted(path: string): boolean {
  if (path.startsWith("/") || path.startsWith("\\\\")) {
    return true;
  }
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    return true;
  }
  return isAbsolute(path);
}
