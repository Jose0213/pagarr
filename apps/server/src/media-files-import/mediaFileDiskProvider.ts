/**
 * Forward-references for the slice of `System.IO.Abstractions`
 * (`IFileInfo`/`IDirectoryInfo`) and `NzbDrone.Common.Disk.IDiskProvider`
 * that this module's real C# source actually calls. Neither type belongs
 * to this module -- `IDiskProvider` is `NzbDrone.Common`, a foundational
 * filesystem-abstraction layer no worktree in this port phase owns yet
 * (see `root-folders/disk-provider.ts`'s doc comment: that file only ports
 * the four methods RootFolderService needs, not the ~40-method full
 * surface). This module needs a much larger slice (file move/delete,
 * locking, directory listing, mount enumeration for the Windows-service
 * inaccessible-path diagnostic) than RootFolderService did, so rather than
 * grow root-folders/disk-provider.ts's IDiskProvider out from under that
 * module (out of this worktree's scope -- only media-files-import/ may be
 * touched), the exact narrow surface this module's files actually call is
 * declared fresh here. Field/method names are copied 1:1 from the real
 * C# interfaces so a future full IDiskProvider port is a drop-in
 * replacement, same discipline as root-folders/disk-provider.ts.
 */

/** Forward-ref for `System.IO.Abstractions.IFileInfo`, narrowed to fields this module reads. */
export interface FileInfoLike {
  fullName: string;
  name: string;
  length: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  lastWriteTimeUtc: string;
}

/** Forward-ref for `System.IO.Abstractions.IDirectoryInfo`, narrowed to fields this module reads. */
export interface DirectoryInfoLike {
  fullName: string;
  name: string;
}

/** Forward-ref for `NzbDrone.Common.Disk.IMount` (used by LogInaccessiblePathError's Windows-service diagnostic). */
export interface MountLike {
  rootDirectory: string;
  driveType: "network" | "fixed" | "removable" | "unknown";
}

/**
 * Forward-ref for the slice of `NzbDrone.Common.Disk.IDiskProvider` this
 * module's services call. Every method here corresponds 1:1 to a real
 * `IDiskProvider` member of the same name (PascalCase in C#).
 */
export interface IMediaFileDiskProvider {
  folderExists(path: string): boolean;
  fileExists(path: string): boolean;
  getDirectoryInfos(path: string): DirectoryInfoLike[];
  getDirectoryInfo(path: string): DirectoryInfoLike;
  getFileInfo(path: string): FileInfoLike;
  getFiles(path: string, recursive: boolean): string[];
  getFileSize(path: string): number;
  isFileLocked(path: string): boolean;
  deleteFolder(path: string, recursive: boolean): void;
  getParentFolder(path: string): string;
  fileGetLastWrite(path: string): string;
  getMounts(): MountLike[];
}
