import {
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
  rmSync,
  copyFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  accessSync,
  constants as fsConstants,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Forward-ref for the slice of NzbDrone.Common/Disk/IDiskProvider.cs (plus
 * IAppFolderInfo.cs, ported below in the same file for locality) that
 * `BackupService.cs` actually calls: `EnsureFolder`/`FolderWritable`/
 * `GetFiles`/`DeleteFile`/`DeleteFolder`/`FolderExists`/`EmptyFolder`/
 * `GetFileSize`/`FileGetLastWrite`/`MoveFile`/`WriteAllText`.
 *
 * This is a THIRD, independent partial port of the same real C#
 * `IDiskProvider` interface -- `root-folders/disk-provider.ts` (a
 * different slice) and `media-files-organize/diskProvider.ts` (yet another,
 * larger slice -- see that file's own doc comment on why it doesn't share
 * with root-folders') are the other two. Kept local to `backup/` rather
 * than importing either sibling module's private file, per this port's
 * per-module self-containment convention documented in both of those
 * files' own doc comments (a future full `IDiskProvider` port can absorb
 * all three call sites without changing any of their callers).
 */
export interface IBackupDiskProvider {
  ensureFolder(path: string): void;
  folderExists(path: string): boolean;
  folderWritable(path: string): boolean;
  emptyFolder(path: string): void;
  getFiles(path: string, recursive: boolean): string[];
  getFileSize(path: string): number;
  fileGetLastWrite(path: string): Date;
  deleteFile(path: string): void;
  deleteFolder(path: string, recursive: boolean): void;
  moveFile(sourcePath: string, targetPath: string, overwrite?: boolean): void;
  /** Ported from the slice of `IDiskTransferService.TransferFile(..., TransferMode.Copy)` `BackupService.BackupConfigFile` uses. */
  copyFile(sourcePath: string, targetPath: string): void;
  writeAllText(path: string, contents: string): void;
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

export class BackupDiskProvider implements IBackupDiskProvider {
  ensureFolder(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  folderExists(path: string): boolean {
    return existsSync(path);
  }

  /** Ported from DiskProviderBase.FolderWritable: best-effort write-access probe (C# tries creating+deleting a temp file; here `fs.accessSync(W_OK)` is the direct Node equivalent). */
  folderWritable(path: string): boolean {
    try {
      accessSync(path, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  emptyFolder(path: string): void {
    for (const entry of this.readdirSafe(path)) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) {
        rmSync(full, { recursive: true, force: true });
      } else {
        unlinkSync(full);
      }
    }
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

  getFileSize(path: string): number {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }

  fileGetLastWrite(path: string): Date {
    try {
      return statSync(path).mtime;
    } catch {
      return new Date(0);
    }
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

  moveFile(sourcePath: string, targetPath: string, overwrite = false): void {
    if (overwrite) {
      this.deleteFile(targetPath);
    }
    try {
      mkdirSync(dirname(targetPath), { recursive: true });
      renameSync(sourcePath, targetPath);
    } catch (e) {
      if (isNodeError(e) && e.code === "EXDEV") {
        copyFileSync(sourcePath, targetPath);
        this.deleteFile(sourcePath);
        return;
      }
      throw e;
    }
  }

  copyFile(sourcePath: string, targetPath: string): void {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }

  writeAllText(path: string, contents: string): void {
    writeFileSync(path, contents, "utf8");
  }

  private readdirSafe(path: string): { name: string; isDirectory(): boolean; isFile(): boolean }[] {
    try {
      return readdirSync(path, { withFileTypes: true });
    } catch {
      return [];
    }
  }
}

/**
 * Forward-ref for the slice of NzbDrone.Common/EnvironmentInfo/
 * IAppFolderInfo.cs `BackupService.cs` calls: `TempFolder`/
 * `GetConfigPath()`/`GetAppDataPath()`/`GetDatabaseRestore()`. This is
 * caller-supplied config (app data directory layout), not filesystem
 * probing, so it's a plain data interface rather than something with a
 * default Node implementation.
 */
export interface IAppFolderInfo {
  tempFolder: string;
  getConfigPath(): string;
  getAppDataPath(): string;
  /** Ported from `IAppFolderInfo.GetDatabaseRestore()`: the path a restored `readarr.db` is moved to (read by app startup on next boot, not this module). */
  getDatabaseRestore(): string;
}
