import {
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
  rmSync,
  renameSync,
  copyFileSync,
  linkSync,
  readdirSync,
  utimesSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Ported from the slice of NzbDrone.Common/Disk/IDiskProvider.cs (and its
 * DiskProviderBase.cs / platform DiskProvider.cs implementations) that this
 * module's services (BookFileMovingService, RecycleBinProvider,
 * UpgradeMediaFileService, UpdateBookFileService, MediaFileAttributeService,
 * DiskScanService) actually call.
 *
 * `root-folders/disk-provider.ts` already ports a *different*, smaller slice
 * (folderExists/folderWritable/getAvailableSpace/getTotalSize -- what
 * RootFolderService needs) of the same real C# `IDiskProvider` interface.
 * Per this module's task constraints ("DO NOT modify files outside
 * apps/server/src/media-files-organize/"), that file can't be extended in
 * place; this module needs a materially different slice (file/folder
 * move+copy+delete, permissions, timestamps) that root-folders' version
 * doesn't cover at all, so this is a second, disjoint partial port of the
 * same C# interface rather than a shared one. Both are faithful to the same
 * source interface and use the same method-naming convention (camelCase
 * mirroring the C# PascalCase names); a future full `IDiskProvider` port (a
 * dedicated Common/Disk module) should absorb both call sites without
 * changing either one's callers.
 */
/** Ported from the slice of `IFileInfo` (System.IO.Abstractions) DiskScanService reads: FullName, Extension, Length (size), LastWriteTimeUtc. */
export interface FileInfoLike {
  fullName: string;
  name: string;
  extension: string;
  length: number;
  lastWriteTimeUtc: Date;
}

export interface IExtendedDiskProvider {
  fileExists(path: string): boolean;
  folderExists(path: string): boolean;
  folderEmpty(path: string): boolean;
  getFileSize(path: string): number;
  createFolder(path: string): void;
  deleteFile(path: string): void;
  deleteFolder(path: string, recursive: boolean): void;
  moveFile(sourcePath: string, targetPath: string, overwrite?: boolean): void;
  moveFolder(sourcePath: string, targetPath: string): void;
  copyFile(sourcePath: string, targetPath: string): void;
  tryCreateHardLink(sourcePath: string, targetPath: string): boolean;
  getDirectories(path: string): string[];
  getFiles(path: string, recursive: boolean): string[];
  getFileInfos(path: string, recursive?: boolean): FileInfoLike[];
  removeEmptySubfolders(path: string): void;
  fileGetLastWrite(path: string): Date;
  fileSetLastWriteTime(path: string, time: Date): void;
  folderSetLastWriteTime(path: string, time: Date): void;
  getFileAttributes(path: string): string;
  inheritFolderPermissions(path: string): void;
  setPermissions(path: string, mode: string, group: string): void;
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

export class ExtendedDiskProvider implements IExtendedDiskProvider {
  fileExists(path: string): boolean {
    return existsSync(path);
  }

  folderExists(path: string): boolean {
    return existsSync(path);
  }

  /** Ported from DiskProviderBase.FolderEmpty: true if the folder has no files and no subdirectories. */
  folderEmpty(path: string): boolean {
    return this.readdirSafe(path).length === 0;
  }

  getFileSize(path: string): number {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }

  createFolder(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  deleteFile(path: string): void {
    try {
      unlinkSync(path);
    } catch (e) {
      if (isNodeError(e) && e.code === "ENOENT") {
        return;
      }
      throw e;
    }
  }

  deleteFolder(path: string, recursive: boolean): void {
    rmSync(path, { recursive, force: true });
  }

  /**
   * Ported from the effective behavior of DiskProviderBase.MoveFile +
   * platform TryCreateHardLink/File.Move: attempts an atomic rename first
   * (works within the same filesystem/mount, matching C#'s primary path),
   * falling back to copy+delete for cross-device moves (Node's `fs.rename`
   * throws EXDEV in that case, same class of failure the C# source handles
   * via its mount-comparison branch in DiskTransferService -- see
   * bookFileMovingService.ts's module doc comment on why the full
   * mount-aware DiskTransferService.TransferFile logic isn't ported 1:1).
   */
  moveFile(sourcePath: string, targetPath: string, overwrite = false): void {
    if (overwrite) {
      this.deleteFile(targetPath);
    }
    try {
      mkdirSync(dirname(targetPath), { recursive: true });
      renameSync(sourcePath, targetPath);
    } catch (e) {
      if (isNodeError(e) && e.code === "EXDEV") {
        this.copyFile(sourcePath, targetPath);
        this.deleteFile(sourcePath);
        return;
      }
      throw e;
    }
  }

  moveFolder(sourcePath: string, targetPath: string): void {
    mkdirSync(dirname(targetPath), { recursive: true });
    renameSync(sourcePath, targetPath);
  }

  copyFile(sourcePath: string, targetPath: string): void {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }

  /** Ported from DiskProviderBase.TryCreateHardLink: best-effort, returns false on any failure rather than throwing (matching the C# source's try/catch-and-return-false wrapper). */
  tryCreateHardLink(sourcePath: string, targetPath: string): boolean {
    try {
      mkdirSync(dirname(targetPath), { recursive: true });
      linkSync(sourcePath, targetPath);
      return true;
    } catch {
      return false;
    }
  }

  getDirectories(path: string): string[] {
    return this.readdirSafe(path)
      .filter((e) => e.isDirectory())
      .map((e) => join(path, e.name));
  }

  getFiles(path: string, recursive: boolean): string[] {
    const entries = this.readdirSafe(path);
    const files = entries.filter((e) => e.isFile()).map((e) => join(path, e.name));

    if (!recursive) {
      return files;
    }

    for (const dirEntry of entries.filter((e) => e.isDirectory())) {
      files.push(...this.getFiles(join(path, dirEntry.name), true));
    }

    return files;
  }

  /** Ported from `IDiskProvider.GetFileInfos(string path, bool recursive = false)`. */
  getFileInfos(path: string, recursive = false): FileInfoLike[] {
    const entries = this.readdirSafe(path);
    const result: FileInfoLike[] = [];

    for (const entry of entries.filter((e) => e.isFile())) {
      const fullName = join(path, entry.name);
      let stat;
      try {
        stat = statSync(fullName);
      } catch {
        continue;
      }

      const dot = entry.name.lastIndexOf(".");
      result.push({
        fullName,
        name: entry.name,
        extension: dot > 0 ? entry.name.slice(dot) : "",
        length: stat.size,
        lastWriteTimeUtc: stat.mtime,
      });
    }

    if (recursive) {
      for (const dirEntry of entries.filter((e) => e.isDirectory())) {
        result.push(...this.getFileInfos(join(path, dirEntry.name), true));
      }
    }

    return result;
  }

  /**
   * Ported from DiskProviderBase.RemoveEmptySubfolders: recursively deletes
   * subfolders that contain no files (after recursing -- a folder that only
   * contains now-empty subfolders is itself removed), matching the
   * `GetFiles(..., allDirectories: true).Empty()` per-subfolder check.
   */
  removeEmptySubfolders(path: string): void {
    if (!this.folderExists(path)) {
      return;
    }

    for (const dir of this.getDirectories(path)) {
      this.removeEmptySubfolders(dir);

      if (this.getFiles(dir, true).length === 0 && this.getDirectories(dir).length === 0) {
        this.deleteFolder(dir, true);
      }
    }
  }

  fileGetLastWrite(path: string): Date {
    try {
      return statSync(path).mtime;
    } catch {
      return new Date(0);
    }
  }

  fileSetLastWriteTime(path: string, time: Date): void {
    utimesSync(path, time, time);
  }

  folderSetLastWriteTime(path: string, time: Date): void {
    utimesSync(path, time, time);
  }

  /** Ported from DiskProvider.GetFileAttributes (Windows-specific debug helper -- called only via `_logger.Debug` in RecycleBinProvider.DeleteFile). Returns a best-effort octal mode string, not a real Windows FileAttributes bitmask, since Node has no equivalent API. */
  getFileAttributes(path: string): string {
    try {
      return statSync(path).mode.toString(8);
    } catch {
      return "";
    }
  }

  /** Ported from DiskProvider.InheritFolderPermissions (Windows ACL inheritance). No POSIX/Node equivalent exists; matches the C# source's own try/catch-and-ignore-failure callers (MediaFileAttributeService.SetFilePermissions) by being a safe no-op here. */
  inheritFolderPermissions(_path: string): void {
    // No-op: Windows ACL inheritance has no cross-platform Node equivalent.
    // Callers (MediaFileAttributeService) already wrap this in a try/catch
    // that swallows UnauthorizedAccessException/InvalidOperationException/
    // FileNotFoundException, matching a no-op's observable behavior.
  }

  /**
   * Ported from DiskProvider.SetPermissions (Mono chmod/chown, Linux/Mac
   * only). Uses Node's `fs.chmodSync` for the mode; chown by *group name*
   * (not gid) has no direct Node API, so this only applies the chmod half --
   * matching real behavior on Windows hosts (where SetPermissionsLinux is
   * never enabled) while leaving a documented gap on Linux/Mac hosts for the
   * chown half. This is exactly known-issue #5 (filesystem permission
   * friction) territory flagged in this module's task brief -- noted here,
   * not silently fixed, per this port's "port precisely, patch later"
   * discipline.
   */
  setPermissions(path: string, mode: string, _group: string): void {
    const parsed = Number.parseInt(mode, 8);
    if (!Number.isNaN(parsed)) {
      try {
        chmodSync(path, parsed);
      } catch {
        // Matches SetPermissions' try/catch-and-log-warn wrapper in the C# source.
      }
    }
  }

  private readdirSafe(path: string): { name: string; isDirectory(): boolean; isFile(): boolean }[] {
    try {
      return readdirSync(path, { withFileTypes: true });
    } catch {
      return [];
    }
  }
}
