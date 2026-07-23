import { pathEquals } from "../root-folders/path-utils.js";

/**
 * Ported from the slice of NzbDrone.Common/Extensions/PathExtensions.cs and
 * NzbDrone.Common/PathEqualityComparer.cs that the Extras module actually
 * uses: `GetRelativePath`, and the `IntersectBy`/`ExceptBy` +
 * `PathEqualityComparer.Instance` combo used throughout
 * `ImportExistingExtraFilesBase.Filter`/`Clean`.
 *
 * `pathEquals` (case-insensitive on Windows, case-sensitive elsewhere) is
 * the REAL function from `root-folders/path-utils.ts` (Phase 1, already
 * merged to main) -- not a forward-reference. `PathEqualityComparer` in C#
 * is just `IEqualityComparer<string>` wrapping `PathEquals`/a
 * `CleanFilePath().ToLower()`-or-not hash, so no separate port of the
 * comparer class itself is needed: the two LINQ set operations it backs
 * (`IntersectBy`/`ExceptBy` with a custom comparer) are ported directly as
 * `intersectByPath`/`exceptByPath` below, built on the real `pathEquals`.
 */

/**
 * Ported from PathExtensions.GetRelativePath(this string parentPath, string
 * childPath). Throws NotParentException (`Error` here, matching this repo's
 * convention of not porting exception hierarchies that aren't caught
 * anywhere -- see e.g. db/errors.ts) if `childPath` isn't actually inside
 * `parentPath`. Trims leading/trailing path separators from the remainder,
 * same as C#'s `.Trim(Path.DirectorySeparatorChar)` (both `/` and `\` are
 * trimmed here since callers may pass either flavor of separator, matching
 * this repo's platform-aware `path-utils.ts` conventions elsewhere).
 */
export function getRelativePath(parentPath: string, childPath: string): string {
  if (!isParentPathForRelative(parentPath, childPath)) {
    throw new Error(`${childPath} is not a child of ${parentPath}`);
  }

  return childPath.slice(parentPath.length).replace(/^[/\\]+|[/\\]+$/g, "");
}

/**
 * Narrow re-implementation of `string.IsParentPath` sufficient for
 * `GetRelativePath`'s guard: childPath must literally start with
 * parentPath (case-sensitivity per `pathEquals`'s OS rule). This
 * intentionally does NOT reuse `root-folders/path-utils.ts`'s
 * `isParentPath` (that one requires childPath to have at least one MORE
 * path segment than parentPath -- correct for RootFolder ancestor checks,
 * but `GetRelativePath` in the real C# is called with childPath ==
 * parentPath in some code paths, e.g. when an author's own folder is
 * passed as both root and target, which must yield an empty relative
 * path, not throw).
 */
function isParentPathForRelative(parentPath: string, childPath: string): boolean {
  const normalize = (p: string): string => p.replace(/[/\\]+$/, "");
  const parent = normalize(parentPath);
  const child = normalize(childPath);

  if (pathEquals(parent, child)) {
    return true;
  }

  const prefixed =
    child.length > parent.length && (child[parent.length] === "/" || child[parent.length] === "\\");
  if (!prefixed) {
    return false;
  }

  return pathEquals(child.slice(0, parent.length), parent);
}

/**
 * Ported from the `authorFiles.IntersectBy(s => Path.Combine(author.Path,
 * s.RelativePath), filesOnDisk, f => f, PathEqualityComparer.Instance)`
 * call in `ImportExistingExtraFilesBase.Filter`: returns items from
 * `items` whose key (per `keySelector`) path-equals any entry in `keys`.
 * Order/duplicates follow `Array.prototype.filter`'s natural iteration,
 * matching LINQ `IntersectBy`'s left-to-right, first-occurrence-kept
 * semantics closely enough for this module's actual usage (neither call
 * site relies on de-duplicating `items` itself).
 */
export function intersectByPath<T>(
  items: T[],
  keys: string[],
  keySelector: (item: T) => string
): T[] {
  return items.filter((item) => keys.some((key) => pathEquals(keySelector(item), key)));
}

/**
 * Ported from the `.Except(..., PathEqualityComparer.Instance)` calls in
 * `ImportExistingExtraFilesBase.Filter` and the `ExceptBy` call in
 * `.Clean`: returns items from `items` whose key does NOT path-equal any
 * entry in `keys`.
 */
export function exceptByPath<T>(items: T[], keys: string[], keySelector: (item: T) => string): T[] {
  return items.filter((item) => !keys.some((key) => pathEquals(keySelector(item), key)));
}

/** Plain (non-keyed) ported form of `.Except(..., PathEqualityComparer.Instance)` for two `string[]`s directly. */
export function exceptPaths(items: string[], keys: string[]): string[] {
  return items.filter((item) => !keys.some((key) => pathEquals(item, key)));
}
