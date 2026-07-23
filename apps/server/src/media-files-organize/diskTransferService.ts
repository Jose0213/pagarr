import { dirname } from "node:path";
import type { IExtendedDiskProvider } from "./diskProvider.js";
import { DestinationAlreadyExistsException, FileAlreadyExistsException } from "./errors.js";
import { pathEquals } from "../root-folders/path-utils.js";

/**
 * Ported from NzbDrone.Common/Disk/TransferMode.cs +
 * NzbDrone.Common/Disk/DiskTransferService.cs -- the slice
 * BookFileMovingService/RecycleBinProvider actually call (`TransferFile`/
 * `TransferFolder`).
 *
 * DEVIATION: the real `DiskTransferService.TransferFile` branches heavily on
 * filesystem *mount* comparison (`IDiskProvider.GetMount`) to pick
 * reflink/hardlink/copy strategies specific to btrfs/zfs/cifs, and retries a
 * verified byte-count check after move/copy (`TryMoveFileVerified`/
 * `TryCopyFileVerified`), rolling back on a size mismatch. Node has no
 * portable mount/filesystem-type introspection API, so the btrfs/zfs/cifs
 * special-casing isn't ported -- `moveFile`/`copyFile` fall through to
 * `IExtendedDiskProvider`'s rename-with-EXDEV-fallback (see diskProvider.ts)
 * which already correctly handles the same-mount vs cross-mount split at
 * the OS level (a same-mount `rename()` is atomic; a cross-mount one throws
 * EXDEV and falls back to copy+delete) without needing to detect the
 * mount/filesystem type up front. The verified-size-check-and-rollback
 * behavior around Move/Copy IS ported below (`transferFile`), since it's
 * observable behavior a caller (BookFileMovingService) depends on for
 * data-loss detection, which is squarely in this module's known-issue #5
 * (filesystem permission/data-integrity friction) territory.
 */
export enum TransferMode {
  None = 0,
  Move = 1,
  Copy = 2,
  HardLink = 4,
  HardLinkOrCopy = 2 | 4,
}

/**
 * Ported from C#'s `[Flags] enum TransferMode` + `Enum.HasFlag`. TS enum
 * members compared via bitwise AND need an explicit `number` widening here
 * -- `@typescript-eslint/no-unsafe-enum-comparison` (correctly) flags
 * `(mode & flag) === flag` as comparing two nominally-typed `TransferMode`
 * values that bitwise-AND doesn't actually preserve the enum's declared
 * member set for (e.g. `Move & Copy` = 0, matching `None`, but arithmetically
 * not "the same case label"). Widening both sides to `number` here is the
 * correct fix, not a suppression -- flag-bit checks are inherently
 * number-domain, not enum-domain.
 */
function hasFlag(mode: TransferMode, flag: TransferMode): boolean {
  const modeValue: number = mode;
  const flagValue: number = flag;
  return (modeValue & flagValue) === flagValue;
}

export interface IDiskTransferService {
  transferFolder(sourcePath: string, targetPath: string, mode: TransferMode): TransferMode;
  transferFile(
    sourcePath: string,
    targetPath: string,
    mode: TransferMode,
    overwrite?: boolean
  ): TransferMode;
}

export class DiskTransferService implements IDiskTransferService {
  constructor(private readonly diskProvider: IExtendedDiskProvider) {}

  /**
   * Ported from `DiskTransferService.TransferFolder`. The mount-based
   * same-mount fast-rename branch and the case-insensitive-rename
   * intermediate-backup dance are collapsed into a plain recursive
   * copy-then-optionally-delete, since `IExtendedDiskProvider.moveFolder`
   * (see diskProvider.ts) already does an atomic rename when possible via
   * `fs.renameSync` and only this method's per-file fallback loop is
   * reached when that's not directly applicable (source folder already
   * exists at the destination with different contents, requiring a merge).
   */
  transferFolder(sourcePath: string, targetPath: string, mode: TransferMode): TransferMode {
    if (sourcePath === targetPath) {
      throw new Error(`Source and destination can't be the same ${sourcePath}`);
    }

    if (!this.diskProvider.folderExists(targetPath)) {
      try {
        this.diskProvider.moveFolder(sourcePath, targetPath);
        return mode;
      } catch {
        this.diskProvider.createFolder(targetPath);
      }
    }

    let result = mode;

    for (const subDir of this.diskProvider.getDirectories(sourcePath)) {
      const name = subDir.split(/[/\\]/).pop() ?? subDir;
      result &= this.transferFolder(subDir, `${targetPath}/${name}`, mode);
    }

    for (const sourceFile of this.diskProvider.getFiles(sourcePath, false)) {
      const name = sourceFile.split(/[/\\]/).pop() ?? sourceFile;
      result &= this.transferFile(sourceFile, `${targetPath}/${name}`, mode, true);
    }

    if (hasFlag(mode, TransferMode.Move)) {
      this.diskProvider.deleteFolder(sourcePath, true);
    }

    return result;
  }

  /**
   * Ported from `DiskTransferService.TransferFile`, keeping the
   * verified-size-check on Move/Copy (see module doc comment) and the
   * same-path / hardlink-then-copy-fallback / destination-already-exists
   * behaviors, dropping only the mount/filesystem-type-specific branching
   * (btrfs/zfs reflink, cifs verified-copy-instead-of-rename) noted above.
   */
  transferFile(
    sourcePath: string,
    targetPath: string,
    mode: TransferMode,
    overwrite = false
  ): TransferMode {
    if (!this.diskProvider.fileExists(sourcePath)) {
      throw new Error(`Book file path does not exist: ${sourcePath}`);
    }

    const originalSize = this.diskProvider.getFileSize(sourcePath);

    if (sourcePath === targetPath) {
      throw new Error(`Source and destination can't be the same ${sourcePath}`);
    }

    if (pathEquals(sourcePath, targetPath)) {
      if (hasFlag(mode, TransferMode.HardLink) || hasFlag(mode, TransferMode.Copy)) {
        throw new Error(`Source and destination can't be the same ${sourcePath}`);
      }

      if (hasFlag(mode, TransferMode.Move)) {
        // Case-insensitive-rename dance: C# moves to a temp backup path
        // first, clears the target, then moves the temp path onto the
        // target -- needed on case-insensitive filesystems (Windows) to
        // rename e.g. "foo.mp3" -> "FOO.mp3" without the two paths
        // colliding mid-operation.
        const tempPath = `${sourcePath}.backup~`;
        this.diskProvider.moveFile(sourcePath, tempPath, true);
        try {
          this.clearTargetPath(targetPath, overwrite);
          this.diskProvider.moveFile(tempPath, targetPath);
          return TransferMode.Move;
        } catch (e) {
          try {
            this.diskProvider.moveFile(tempPath, sourcePath);
          } catch {
            // Matches the C# RollbackMove's own try/catch-and-log wrapper.
          }
          throw e;
        }
      }

      return TransferMode.None;
    }

    if (isParentDir(sourcePath, targetPath)) {
      throw new Error(
        `Destination cannot be a child of the source [${sourcePath}] => [${targetPath}]`
      );
    }

    this.clearTargetPath(targetPath, overwrite);

    if (hasFlag(mode, TransferMode.HardLink)) {
      if (this.diskProvider.tryCreateHardLink(sourcePath, targetPath)) {
        return TransferMode.HardLink;
      }

      if (!hasFlag(mode, TransferMode.Copy)) {
        throw new Error(`Hardlinking from '${sourcePath}' to '${targetPath}' failed.`);
      }
    }

    if (hasFlag(mode, TransferMode.Copy)) {
      this.tryCopyFileVerified(sourcePath, targetPath, originalSize);
      return TransferMode.Copy;
    }

    if (hasFlag(mode, TransferMode.Move)) {
      this.tryMoveFileVerified(sourcePath, targetPath, originalSize);
      return TransferMode.Move;
    }

    return TransferMode.None;
  }

  private clearTargetPath(targetPath: string, overwrite: boolean): void {
    if (this.diskProvider.fileExists(targetPath)) {
      if (overwrite) {
        this.diskProvider.deleteFile(targetPath);
      } else {
        throw new DestinationAlreadyExistsException(`Destination ${targetPath} already exists.`);
      }
    }
  }

  private tryCopyFileVerified(sourcePath: string, targetPath: string, originalSize: number): void {
    this.diskProvider.copyFile(sourcePath, targetPath);

    const targetSize = this.diskProvider.getFileSize(targetPath);
    if (targetSize !== originalSize) {
      try {
        this.diskProvider.deleteFile(targetPath);
      } catch {
        // Matches RollbackCopy's own try/catch-and-log wrapper.
      }
      throw new Error(
        `File copy incomplete. [${targetPath}] was ${targetSize} bytes long instead of ${originalSize} bytes.`
      );
    }
  }

  private tryMoveFileVerified(sourcePath: string, targetPath: string, originalSize: number): void {
    try {
      this.diskProvider.moveFile(sourcePath, targetPath);
    } catch (e) {
      if (!(e instanceof FileAlreadyExistsException)) {
        try {
          this.diskProvider.deleteFile(targetPath);
        } catch {
          // Matches RollbackPartialMove's own try/catch-and-log wrapper.
        }
      }
      throw e;
    }

    const targetSize = this.diskProvider.getFileSize(targetPath);
    if (targetSize !== originalSize) {
      throw new Error(
        `File move incomplete, data loss may have occurred. [${targetPath}] was ${targetSize} bytes long instead of the expected ${originalSize}.`
      );
    }
  }
}

function isParentDir(parent: string, child: string): boolean {
  const parentDir = dirname(child);
  return (
    pathEquals(parent, parentDir) ||
    parentDir.startsWith(`${parent}/`) ||
    parentDir.startsWith(`${parent}\\`)
  );
}
