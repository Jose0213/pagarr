/**
 * Ported from NzbDrone.Common/Disk/OsPath.cs.
 *
 * FORWARD-REFERENCE: `OsPath` belongs conceptually to the not-yet-ported
 * `NzbDrone.Common.Disk` module, but it's used pervasively and non-trivially
 * throughout this module's in-scope C# (DownloadClientItem.OutputPath,
 * DownloadClientInfo.OutputRootFolders, QBittorrent's GetImportItem
 * subdirectory-walk, RemotePathMappingService's `+`/`-`/`Contains`
 * arithmetic, Blackhole's watch-folder scanning) -- narrowing to a smaller
 * ad-hoc shape would mean re-deriving the same path-kind-detection/
 * combine/subtract logic in multiple call sites with more room for drift
 * from the real behavior than porting the (small, self-contained, no
 * further dependencies) C# struct faithfully once. When a future Common/Disk
 * module lands, this should be deleted in favor of importing the real type;
 * the API surface here was kept 1:1 with the C# struct's public members so
 * that swap is mechanical.
 *
 * C#'s `OsPath` is a `struct` with operator overloads (`+`, `-`, `==`); TS
 * has no operator overloading, so `+`/`-` become `combine`/`subtract`
 * methods and `==`/`!=`/`Equals` become `equals`.
 */
export enum OsPathKind {
  Unknown = "Unknown",
  Windows = "Windows",
  Unix = "Unix",
}

function hasWindowsDriveLetter(path: string): boolean {
  if (path.length < 2) {
    return false;
  }

  const first = path[0]!;
  if (!/[a-zA-Z]/.test(first) || path[1] !== ":") {
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
    return path.replaceAll("/", "\\");
  }

  if (kind === OsPathKind.Unix) {
    let result = path.replaceAll("\\", "/");
    while (result.includes("//")) {
      result = result.replaceAll("//", "/");
    }
    return result;
  }

  return path;
}

export class OsPath {
  private readonly path: string;
  private readonly kind: OsPathKind;

  constructor(path: string | null, kind?: OsPathKind) {
    if (path === null) {
      this.kind = kind ?? OsPathKind.Unknown;
      this.path = "";
    } else if (kind !== undefined) {
      this.kind = kind;
      this.path = fixSlashes(path, kind);
    } else {
      this.kind = detectPathKind(path);
      this.path = fixSlashes(path, this.kind);
    }
  }

  static empty(): OsPath {
    return new OsPath(null);
  }

  getKind(): OsPathKind {
    return this.kind;
  }

  get isWindowsPath(): boolean {
    return this.kind === OsPathKind.Windows;
  }

  get isUnixPath(): boolean {
    return this.kind === OsPathKind.Unix;
  }

  get isEmpty(): boolean {
    return this.path.trim() === "";
  }

  get isRooted(): boolean {
    if (this.isWindowsPath) {
      return this.path.startsWith("\\\\") || hasWindowsDriveLetter(this.path);
    }

    if (this.isUnixPath) {
      return this.path.startsWith("/");
    }

    return false;
  }

  private getFileNameIndex(): number {
    if (this.path.length < 2) {
      return -1;
    }

    const searchSpace = this.path.slice(0, this.path.length - 1);
    let index = -1;
    for (let i = searchSpace.length - 1; i >= 0; i--) {
      if (searchSpace[i] === "/" || searchSpace[i] === "\\") {
        index = i;
        break;
      }
    }

    if (index === -1) {
      return -1;
    }

    if (this.path.startsWith("\\\\") && index < 2) {
      return -1;
    }

    if (this.path.startsWith("/") && index === 0) {
      index++;
    }

    return index;
  }

  get directory(): OsPath {
    const index = this.getFileNameIndex();

    if (index === -1) {
      return OsPath.empty();
    }

    return new OsPath(this.path.slice(0, index), this.kind).asDirectory();
  }

  get fullPath(): string {
    return this.path;
  }

  get fileName(): string | null {
    const index = this.getFileNameIndex();

    if (index === -1) {
      const trimmed = trimChars(this.path, "\\/");
      return trimmed.length === 0 ? null : trimmed;
    }

    return trimChars(this.path.slice(index), "\\/");
  }

  private getFragments(): string[] {
    return this.path.split(/[\\/]+/).filter((s) => s.length > 0);
  }

  toString(): string {
    return this.path;
  }

  asDirectory(): OsPath {
    if (this.isEmpty) {
      return this;
    }

    if (this.kind === OsPathKind.Windows) {
      return new OsPath(trimEnd(this.path, "\\") + "\\", this.kind);
    }

    if (this.kind === OsPathKind.Unix) {
      return new OsPath(trimEnd(this.path, "/") + "/", this.kind);
    }

    return this;
  }

  /** Ported from `OsPath.Contains(OsPath other)`: true if `other` is this path or a descendant of it. */
  contains(other: OsPath): boolean {
    if (!this.isRooted || !other.isRooted) {
      return false;
    }

    const leftFragments = this.getFragments();
    const rightFragments = other.getFragments();

    if (rightFragments.length < leftFragments.length) {
      return false;
    }

    const caseInsensitive = this.kind === OsPathKind.Windows || other.kind === OsPathKind.Windows;

    for (let i = 0; i < leftFragments.length; i++) {
      if (!fragmentEquals(leftFragments[i]!, rightFragments[i]!, caseInsensitive)) {
        return false;
      }
    }

    return true;
  }

  /** Ported from `OsPath.Equals(OsPath other)` / `operator ==`. */
  equals(other: OsPath): boolean {
    if (this.path === other.path) {
      return true;
    }

    const caseInsensitive = this.kind === OsPathKind.Windows || other.kind === OsPathKind.Windows;
    return fragmentEquals(this.path, other.path, caseInsensitive);
  }

  /** Ported from `operator +(OsPath left, OsPath right)`. */
  combine(right: OsPath): OsPath {
    if (this.kind !== right.kind && right.kind !== OsPathKind.Unknown) {
      throw new Error(
        `Cannot combine OsPaths of different platforms ('${this.toString()}' + '${right.toString()}')`
      );
    }

    if (right.isEmpty) {
      return this;
    }

    if (right.isRooted) {
      return right;
    }

    if (this.kind === OsPathKind.Windows || right.kind === OsPathKind.Windows) {
      return new OsPath(
        [trimEnd(this.path, "\\"), trimStart(right.path, "\\")].join("\\"),
        OsPathKind.Windows
      );
    }

    if (this.kind === OsPathKind.Unix || right.kind === OsPathKind.Unix) {
      return new OsPath([trimEnd(this.path, "/"), right.path].join("/"), OsPathKind.Unix);
    }

    return new OsPath([this.path, right.path].join("/"), OsPathKind.Unknown);
  }

  /** Ported from `operator +(OsPath left, string right)`. */
  combineString(right: string): OsPath {
    return this.combine(new OsPath(right));
  }

  /** Ported from `operator -(OsPath left, OsPath right)`: the relative path from `right` to `this`. */
  subtract(right: OsPath): OsPath {
    if (!this.isRooted || !right.isRooted) {
      throw new Error("Cannot determine relative path for unrooted paths.");
    }

    const leftFragments = this.getFragments();
    const rightFragments = right.getFragments();

    const caseInsensitive = this.kind === OsPathKind.Windows || right.kind === OsPathKind.Windows;

    let i = 0;
    for (; i < leftFragments.length && i < rightFragments.length; i++) {
      if (!fragmentEquals(leftFragments[i]!, rightFragments[i]!, caseInsensitive)) {
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

    if (this.fullPath.endsWith("\\") || this.fullPath.endsWith("/")) {
      newFragments.push("");
    }

    if (this.kind === OsPathKind.Windows || right.kind === OsPathKind.Windows) {
      return new OsPath(newFragments.join("\\"), OsPathKind.Unknown);
    }

    return new OsPath(newFragments.join("/"), OsPathKind.Unknown);
  }
}

function fragmentEquals(a: string, b: string, caseInsensitive: boolean): boolean {
  return caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function trimChars(value: string, chars: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start]!)) {
    start++;
  }
  while (end > start && chars.includes(value[end - 1]!)) {
    end--;
  }
  return value.slice(start, end);
}

function trimStart(value: string, char: string): string {
  let i = 0;
  while (i < value.length && value[i] === char) {
    i++;
  }
  return value.slice(i);
}

function trimEnd(value: string, char: string): string {
  let i = value.length;
  while (i > 0 && value[i - 1] === char) {
    i--;
  }
  return value.slice(0, i);
}
