import type { IExtendedDiskProvider } from "./diskProvider.js";
import type { IConfigService } from "../config/configService.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/MediaFileAttributeService.cs.
 *
 * C# branches on `OsInfo.IsWindows`/`OsInfo.IsNotWindows`; ported here via
 * `process.platform === "win32"`, matching this repo's established
 * OS-detection convention (see root-folders/path-utils.ts's
 * `isCaseInsensitive()`). Directly relevant to known-issue #5 (filesystem
 * permission friction) -- this is the module that actually applies
 * (or silently no-ops around) file/folder permissions after every
 * move/copy.
 */
export interface IMediaFileAttributeService {
  setFilePermissions(path: string): void;
  setFolderPermissions(path: string): void;
  setFolderLastWriteTime(path: string, time: Date): void;
}

function isWindows(): boolean {
  return process.platform === "win32";
}

export class MediaFileAttributeService implements IMediaFileAttributeService {
  constructor(
    private readonly configService: IConfigService,
    private readonly diskProvider: IExtendedDiskProvider
  ) {}

  setFilePermissions(path: string): void {
    if (isWindows()) {
      // Wrapped in try/catch to prevent this from causing issues with remote NAS boxes.
      try {
        this.diskProvider.inheritFolderPermissions(path);
      } catch {
        // Matches the C# source's swallow-and-log (Debug for the three
        // expected exception types, Warn otherwise) -- no logger ported
        // yet (see this port's Instrumentation-not-ported convention), so
        // both branches collapse to a silent swallow here.
      }
    } else {
      this.setMonoPermissions(path);
    }
  }

  setFolderPermissions(path: string): void {
    if (!isWindows()) {
      this.setMonoPermissions(path);
    }
  }

  setFolderLastWriteTime(path: string, time: Date): void {
    if (isWindows()) {
      this.diskProvider.folderSetLastWriteTime(path, time);
    }
  }

  private setMonoPermissions(path: string): void {
    if (!this.configService.setPermissionsLinux) {
      return;
    }

    try {
      this.diskProvider.setPermissions(
        path,
        this.configService.chmodFolder,
        this.configService.chownGroup
      );
    } catch {
      // Matches the C# source's catch-and-Warn-log wrapper.
    }
  }
}
