/**
 * Ported from NzbDrone.Common/Disk/OsPath.cs.
 *
 * `RemotePathMappingService`'s whole job is cross-OS path remapping
 * (matching a Windows-style remote path against a Unix-style local mount,
 * or vice versa), so unlike other already-ported modules that treat OsPath
 * as out-of-scope background machinery (e.g. root-folders/path-utils.ts,
 * which explicitly punts on OsPath's dual-OS Kind detection since
 * RootFolders only ever compares paths native to the single OS Pagarr runs
 * on), this module's real behavior cannot be faithfully ported without it.
 * Ported as a plain value type (a frozen object + free functions) rather
 * than a class with operator overloads, since TS has no operator
 * overloading -- `+`/`-` become `combineOsPath`/`subtractOsPath`.
 */

export enum OsPathKind {
  Unknown = "Unknown",
  Windows = "Windows",
  Unix = "Unix",
}

export interface OsPath {
  readonly fullPath: string;
  readonly kind: OsPathKind;
}

function hasWindowsDriveLetter(path: string): boolean {
  if (path.length < 2) {
    return false;
  }
  if (!/[a-zA-Z]/.test(path[0]!) || path[1] !== ":") {
    return false;
  }
  if (path.length > 2 && path[2] !== "\\" && path[2] !== "/") {
    return false;
  }
  return true;
}

function detectPathKind(path: string): OsPathKind {
  if (path.startsWith("/")) {
    return OsPathKind.Unix;
  }
  if (hasWindowsDriveLetter(path) || path.includes("\\")) {
    return OsPathKind.Windows;
  }
  if (path.includes("/")) {
    return OsPathKind.Unix;
  }
  return OsPathKind.Unknown;
}

function fixSlashes(path: string, kind: OsPathKind): string {
  if (kind === OsPathKind.Windows) {
    return path.replace(/\//g, "\\");
  }
  if (kind === OsPathKind.Unix) {
    let result = path.replace(/\\/g, "/");
    while (result.includes("//")) {
      result = result.replace("//", "/");
    }
    return result;
  }
  return path;
}

/** Ported from `new OsPath(string path)` / `new OsPath(string path, OsPathKind kind)`. */
export function newOsPath(path: string | null, kind?: OsPathKind): OsPath {
  if (path === null) {
    return { fullPath: "", kind: kind ?? OsPathKind.Unknown };
  }
  const resolvedKind = kind ?? detectPathKind(path);
  return { fullPath: fixSlashes(path, resolvedKind), kind: resolvedKind };
}

export function isEmptyOsPath(path: OsPath): boolean {
  return path.fullPath.trim() === "";
}

export function isRootedOsPath(path: OsPath): boolean {
  if (path.kind === OsPathKind.Windows) {
    return path.fullPath.startsWith("\\\\") || hasWindowsDriveLetter(path.fullPath);
  }
  if (path.kind === OsPathKind.Unix) {
    return path.fullPath.startsWith("/");
  }
  return false;
}

/** Ported from `OsPath.AsDirectory()`. */
export function asDirectoryOsPath(path: OsPath): OsPath {
  if (isEmptyOsPath(path)) {
    return path;
  }
  if (path.kind === OsPathKind.Windows) {
    return newOsPath(path.fullPath.replace(/\\+$/, "") + "\\", path.kind);
  }
  if (path.kind === OsPathKind.Unix) {
    return newOsPath(path.fullPath.replace(/\/+$/, "") + "/", path.kind);
  }
  return path;
}

function getFragments(path: OsPath): string[] {
  return path.fullPath.split(/[\\/]/).filter((s) => s.length > 0);
}

/** Ported from `OsPath.Contains(OsPath other)`. */
export function containsOsPath(left: OsPath, other: OsPath): boolean {
  if (!isRootedOsPath(left) || !isRootedOsPath(other)) {
    return false;
  }

  const leftFragments = getFragments(left);
  const rightFragments = getFragments(other);

  if (rightFragments.length < leftFragments.length) {
    return false;
  }

  const caseInsensitive = left.kind === OsPathKind.Windows || other.kind === OsPathKind.Windows;

  for (let i = 0; i < leftFragments.length; i++) {
    const l = caseInsensitive ? leftFragments[i]!.toLowerCase() : leftFragments[i]!;
    const r = caseInsensitive ? rightFragments[i]!.toLowerCase() : rightFragments[i]!;
    if (l !== r) {
      return false;
    }
  }

  return true;
}

/**
 * Ported from `OsPath operator +(OsPath left, OsPath right)`. Throws if
 * the two paths are of different, known (non-Unknown) kinds -- matching the
 * C# original's `"Cannot combine OsPaths of different platforms"` Exception.
 */
export function combineOsPath(left: OsPath, right: OsPath): OsPath {
  if (left.kind !== right.kind && right.kind !== OsPathKind.Unknown) {
    throw new Error(
      `Cannot combine OsPaths of different platforms ('${left.fullPath}' + '${right.fullPath}')`
    );
  }

  if (isEmptyOsPath(right)) {
    return left;
  }

  if (isRootedOsPath(right)) {
    return right;
  }

  if (left.kind === OsPathKind.Windows || right.kind === OsPathKind.Windows) {
    return newOsPath(
      [left.fullPath.replace(/\\+$/, ""), right.fullPath.replace(/^\\+/, "")].join("\\"),
      OsPathKind.Windows
    );
  }

  if (left.kind === OsPathKind.Unix || right.kind === OsPathKind.Unix) {
    return newOsPath(
      [left.fullPath.replace(/\/+$/, ""), right.fullPath].join("/"),
      OsPathKind.Unix
    );
  }

  return newOsPath([left.fullPath, right.fullPath].join("/"), OsPathKind.Unknown);
}

/**
 * Ported from `OsPath operator -(OsPath left, OsPath right)`: the relative
 * path from `right` to `left`, expressed as `..` segments back up to the
 * common ancestor plus `left`'s remaining segments. Throws if either path
 * is unrooted, matching the C# original's ArgumentException.
 */
export function subtractOsPath(left: OsPath, right: OsPath): OsPath {
  if (!isRootedOsPath(left) || !isRootedOsPath(right)) {
    throw new Error("Cannot determine relative path for unrooted paths.");
  }

  const leftFragments = getFragments(left);
  const rightFragments = getFragments(right);

  const caseInsensitive = left.kind === OsPathKind.Windows || right.kind === OsPathKind.Windows;

  let i = 0;
  for (; i < leftFragments.length && i < rightFragments.length; i++) {
    const l = caseInsensitive ? leftFragments[i]!.toLowerCase() : leftFragments[i]!;
    const r = caseInsensitive ? rightFragments[i]!.toLowerCase() : rightFragments[i]!;
    if (l !== r) {
      break;
    }
  }

  if (i === 0) {
    return right;
  }

  const newFragments: string[] = [];

  for (let j = i; j < rightFragments.length; j++) {
    newFragments.push("..");
  }

  for (let j = i; j < leftFragments.length; j++) {
    newFragments.push(leftFragments[j]!);
  }

  if (left.fullPath.endsWith("\\") || left.fullPath.endsWith("/")) {
    newFragments.push("");
  }

  if (left.kind === OsPathKind.Windows || right.kind === OsPathKind.Windows) {
    return newOsPath(newFragments.join("\\"), OsPathKind.Unknown);
  }

  return newOsPath(newFragments.join("/"), OsPathKind.Unknown);
}
