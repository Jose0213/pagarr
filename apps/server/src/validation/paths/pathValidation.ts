/**
 * Ported from NzbDrone.Core/Validation/{FolderValidator,Paths/PathValidator}.cs
 * (identical bodies -- both call `IsPathValid(PathValidationType.CurrentOs)`)
 * plus the slice of NzbDrone.Common/Extensions/PathExtensions.cs they rely
 * on: `IsPathValid`, `ContainsInvalidPathChars`, `IsPathValidForWindows`,
 * `IsPathValidForNonWindows`.
 *
 * DEVIATION -- OS branching: same `process.platform === "win32"` convention
 * this port already established (root-folders/path-utils.ts's
 * `isCaseInsensitive()`, media-files-organize/mediaFileAttributeService.ts's
 * `isWindows()`) for `OsInfo.IsWindows`/`OsInfo.IsNotWindows`. `CurrentOs`
 * (the only mode either validator actually uses -- `AnyOs` is a real
 * PathValidationType value but neither FolderValidator nor PathValidator
 * pass it) branches on the OS Pagarr is actually running on, read live so
 * tests can stub `process.platform`.
 */

/**
 * Ported from `Path.GetInvalidPathChars()`. Since .NET Core, this set is the
 * same cross-platform (not OS-dependent the way legacy .NET Framework's
 * was): NUL plus the C0 control range (U+0001-U+001F), plus `"`, `<`, `>`,
 * `|`.
 */
const INVALID_PATH_CHARS = new Set<number>([
  0,
  ...Array.from({ length: 31 }, (_, i) => i + 1),
  0x22, // "
  0x3c, // <
  0x3e, // >
  0x7c, // |
]);

/** Ported from PathExtensions.ContainsInvalidPathChars(). */
export function containsInvalidPathChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && INVALID_PATH_CHARS.has(code)) {
      return true;
    }
  }
  return false;
}

function isPathValidForWindows(path: string): boolean {
  // Ported from PathExtensions.IsPathValidForWindows: `path.StartsWith("\\") ||
  // WindowsPathWithDriveRegex.IsMatch(path)` where WindowsPathWithDriveRegex
  // is `^[a-zA-Z]:\\` (note: IsMatch, not a full-string anchor -- but the
  // regex itself is anchored with `^`, so this is equivalent to a
  // starts-with check).
  return path.startsWith("\\") || /^[a-zA-Z]:\\/.test(path);
}

function isPathValidForNonWindows(path: string): boolean {
  return path.startsWith("/");
}

function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Ported from PathExtensions.IsPathValid(path, PathValidationType.CurrentOs)
 * -- the only mode FolderValidator/PathValidator use. Null/whitespace-only
 * or containing invalid path characters is always invalid regardless of OS;
 * otherwise valid iff it satisfies the current OS's own rooted-path shape.
 */
export function isPathValid(path: string | null | undefined): boolean {
  if (path === null || path === undefined || path.trim() === "") {
    return false;
  }

  if (containsInvalidPathChars(path)) {
    return false;
  }

  return isWindows() ? isPathValidForWindows(path) : isPathValidForNonWindows(path);
}

/**
 * Ported from FolderValidator.IsValid() / PathValidator.IsValid() (identical
 * bodies): null value fails outright (distinct from `isPathValid`'s
 * null-is-just-invalid -- here a literal JS `null`/`undefined` short-circuits
 * to `false` before even reaching `isPathValid`, matching C#'s
 * `context.PropertyValue == null` check, which is really the same outcome
 * either way since `isPathValid` also treats null as invalid; kept as an
 * explicit separate check for parity with the two source classes' literal
 * structure).
 */
export function isValidFolderPath(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return isPathValid(value);
}
