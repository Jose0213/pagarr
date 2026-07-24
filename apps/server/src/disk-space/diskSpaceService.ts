import type { IDiskProvider } from "../root-folders/disk-provider.js";
import type { IRootFolderService } from "../root-folders/root-folder-service.js";
import { isPathRooted } from "../root-folders/path-utils.js";
import type { DiskSpace } from "./diskSpace.js";

/**
 * Ported from NzbDrone.Core/DiskSpace/DiskSpaceService.cs.
 *
 * ## What's ported faithfully: the root-folder ("important") path list
 *
 *   - `GetRootPaths()`: every distinct root folder path that's a valid,
 *     existing directory (`path.IsPathValid(...) &&
 *     _diskProvider.FolderExists(path)`) -- ported as `getRootPaths()`
 *     below using this port's real, already-ported `IRootFolderService.all()`
 *     + `IDiskProvider.folderExists()`. `IsPathValid(PathValidationType.CurrentOs)`
 *     (a full OS-aware absolute-path syntax check, `NzbDrone.Common.Extensions.PathExtensions`)
 *     is narrowed to this port's own `isPathRooted()` (root-folders/path-utils.ts,
 *     already used by RootFolderService's own path validation) -- the
 *     closest already-ported equivalent, not a new dependency.
 *   - `GetDiskSpace(paths, suppressWarnings)`: probes free/total space per
 *     path via `IDiskProvider`, skipping (not throwing) a path whose probe
 *     comes back `null` for either value, matching the C# `if
 *     (!freeSpace.HasValue || !totalSpace.HasValue) { continue; }` -- ported
 *     as `getDiskSpaceFor()` below.
 *
 * ## What's a documented forward-ref: the "optional fixed disks" list
 *
 * `GetFixedDisksRootPaths()` (`_diskProvider.GetMounts()`, filtered to
 * `DriveType.Fixed` and excluding known special/container mount paths via
 * `_regexSpecialDrive`) enumerates every OTHER fixed disk on the machine
 * NOT already covered by a root folder, so the UI can show free space for
 * drives the user hasn't configured yet. This port's `root-folders/disk-provider.ts`
 * `IDiskProvider` (already-ported, Phase 1) deliberately only exposes the
 * four methods `RootFolderService` itself needs (see that file's own doc
 * comment) -- no `getMounts()`/mount-enumeration surface exists anywhere in
 * this port yet (the only other module that even references a `getMounts()`
 * *shape* is `media-files-import/mediaFileDiskProvider.ts`'s own narrow
 * forward-ref interface, itself unimplemented against a real mount-listing
 * backend). Rather than block this whole service on a full mount-enumeration
 * port (an OS-level API with no existing Node equivalent as clean as
 * `statfs` was for the two methods `disk-provider.ts` already has), this
 * service accepts an OPTIONAL `MountProvider` collaborator
 * (`getMounts(): MountInfo[]`); when omitted, `getFreeSpace()` simply
 * returns only the root-folder-backed list (`importantRootFolders`'
 * disk-space entries), never throwing -- a strict subset of the real
 * response shape (missing the "other fixed disks" bonus rows), not a
 * broken one. `_regexSpecialDrive`'s container/boot-path exclusion is
 * ported as `SPECIAL_DRIVE_PATTERN` below so a future real `MountProvider`
 * implementation can reuse it verbatim without needing to re-derive the
 * regex from the C# source.
 *
 * `GetVolumeLabel(path)` (used for `DiskSpace.Label`) similarly has no
 * ported equivalent -- Node has no cross-platform volume-label API as
 * direct as `statfs` was for free/total space. Root-folder-backed entries
 * (the path list this service DOES fully support) get `label: ""` --
 * ported faithfully as "no label available" rather than fabricating one;
 * the real UI already tolerates an empty label (it falls back to
 * displaying the path itself when Label is blank).
 */

/** Ported from the exclusion regex `DiskSpaceService._regexSpecialDrive` -- unused until a real `MountProvider` is wired in (see module doc comment), kept here so that future implementation has the exact right pattern to apply. */
export const SPECIAL_DRIVE_PATTERN =
  /^\/var\/lib\/(docker|rancher|kubelet)(\/|$)|^\/(boot|etc)(\/|$)|\/docker(\/var)?\/aufs(\/|$)/;

/** Ported from `NzbDrone.Common.Disk.IMount`, narrowed to the two fields `GetFixedDisksRootPaths` reads. See module doc comment's "documented forward-ref" section. */
export interface MountInfo {
  rootDirectory: string;
  driveType: "fixed" | "network" | "removable" | "unknown";
}

/** Optional collaborator supplying real OS mount enumeration -- see module doc comment. Omitted by default (no mount-enumeration port exists yet). */
export interface MountProvider {
  getMounts(): MountInfo[];
  /** Ported from `IDiskProvider.GetVolumeLabel(path)`. Optional -- defaults to `""` (empty label) when the collaborator itself, or this method, isn't supplied. */
  getVolumeLabel?(path: string): string;
}

export interface IDiskSpaceService {
  getFreeSpace(): DiskSpace[];
}

export class DiskSpaceService implements IDiskSpaceService {
  constructor(
    private readonly diskProvider: IDiskProvider,
    private readonly rootFolderService: IRootFolderService,
    private readonly mountProvider?: MountProvider,
    /** Stand-in for NLog `Logger.Warn(ex, ...)` in `GetDiskSpace`'s per-path catch. See config/configService.ts's established no-NLog-yet convention. */
    private readonly onWarn?: (path: string, error: unknown) => void
  ) {}

  /** Ported from `DiskSpaceService.GetFreeSpace()`. */
  getFreeSpace(): DiskSpace[] {
    const importantRootFolders = distinct(this.getRootPaths());
    const optionalRootFolders = distinct(this.getFixedDisksRootPaths()).filter(
      (p) => !importantRootFolders.includes(p)
    );

    return [
      ...this.getDiskSpace(importantRootFolders, false),
      ...this.getDiskSpace(optionalRootFolders, true),
    ];
  }

  /** Ported from `DiskSpaceService.GetRootPaths()`. See module doc comment for the `IsPathValid` -> `isPathRooted` narrowing. */
  private getRootPaths(): string[] {
    return this.rootFolderService
      .all()
      .map((r) => r.path)
      .filter((path) => isPathRooted(path) && this.diskProvider.folderExists(path));
  }

  /** Ported from `DiskSpaceService.GetFixedDisksRootPaths()`. Empty when no `MountProvider` is supplied -- see module doc comment. */
  private getFixedDisksRootPaths(): string[] {
    if (!this.mountProvider) {
      return [];
    }

    return this.mountProvider
      .getMounts()
      .filter((m) => m.driveType === "fixed")
      .filter((m) => !SPECIAL_DRIVE_PATTERN.test(m.rootDirectory))
      .map((m) => m.rootDirectory);
  }

  /** Ported from `DiskSpaceService.GetDiskSpace(IEnumerable<string> paths, bool suppressWarnings = false)`. */
  private getDiskSpace(paths: string[], suppressWarnings: boolean): DiskSpace[] {
    const results: DiskSpace[] = [];

    for (const path of paths) {
      try {
        const freeSpace = this.diskProvider.getAvailableSpace(path);
        const totalSpace = this.diskProvider.getTotalSize(path);

        if (freeSpace === null || totalSpace === null) {
          continue;
        }

        results.push({
          path,
          freeSpace,
          totalSpace,
          label: this.mountProvider?.getVolumeLabel?.(path) ?? "",
        });
      } catch (e) {
        if (!suppressWarnings) {
          this.onWarn?.(path, e);
        }
      }
    }

    return results;
  }
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}
