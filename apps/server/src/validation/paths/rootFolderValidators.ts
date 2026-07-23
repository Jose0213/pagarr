/**
 * Ported from NzbDrone.Core/Validation/Paths/{RootFolderValidator,
 * RootFolderAncestorValidator}.cs.
 *
 * Both take `IRootFolderService` -- already ported at
 * root-folders/root-folder-service.ts, whose `all()` returns `RootFolder[]`
 * (root-folders/root-folder.ts), matching the C# `_rootFolderService.All()`
 * (a `List<RootFolder>`) these two validators iterate.
 */
import type { IRootFolderService } from "../../root-folders/root-folder-service.js";
import { isParentPath, pathEquals } from "../../root-folders/path-utils.js";

/**
 * Ported from RootFolderValidator.IsValid(): null is valid (nothing
 * configured yet to conflict with); otherwise fails if any existing root
 * folder's path is path-equal to the candidate.
 */
export function isNotExistingRootFolderPath(
  rootFolderService: IRootFolderService,
  path: string | null | undefined
): boolean {
  if (path === null || path === undefined) {
    return true;
  }

  return !rootFolderService.all().some((r) => pathEquals(r.path, path));
}

/**
 * Ported from RootFolderAncestorValidator.IsValid(): null is valid;
 * otherwise fails if the candidate path is a parent (ancestor at any depth)
 * of any existing root folder's path.
 */
export function isNotAncestorOfExistingRootFolder(
  rootFolderService: IRootFolderService,
  path: string | null | undefined
): boolean {
  if (path === null || path === undefined) {
    return true;
  }

  return !rootFolderService.all().some((r) => isParentPath(path, r.path));
}
