import { rm, writeFile } from "node:fs/promises";
import { statfsSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Ported from the slice of NzbDrone.Common/Disk/IDiskProvider.cs (and its
 * DiskProviderBase.cs / Windows+Mono DiskProvider.cs implementations) that
 * RootFolderService actually calls: FolderExists, FolderWritable,
 * GetAvailableSpace, GetTotalSize.
 *
 * Deviation from the C# source: `IDiskProvider` is a ~40-method interface
 * covering the whole filesystem-abstraction surface Readarr uses across many
 * modules (permissions, hardlinks, file transfer, mount enumeration, etc).
 * Porting all of it belongs to a dedicated `Disk`/`Common` module later, not
 * this one. This file ports only the four methods RootFolderService needs,
 * under the same names (camelCased), so that a future full `IDiskProvider`
 * port is a drop-in replacement -- RootFolderService depends on this
 * `IDiskProvider` shape, not on this file's implementation.
 *
 * GetAvailableSpace/GetTotalSize: C# has separate Windows (`GetDiskFreeSpaceEx`
 * kernel32 P/Invoke) and Mono/Linux (`IMount`/statvfs via `Mono.Unix`)
 * implementations, both of which resolve the filesystem/mount *containing*
 * the given path and return its free/total bytes. Node's `fs.statfsSync`
 * (Node 18.15+) does exactly this in one cross-platform call -- it stats the
 * filesystem containing `path`, not `path` itself -- so no manual
 * drive-root/mount resolution is needed the way the C# implementations do.
 * Available space is computed as `bavail * bsize` (blocks available to an
 * unprivileged user), matching `GetDiskFreeSpaceEx`'s "free bytes available
 * to caller" semantics more closely than `bfree` (raw free blocks, which
 * can include blocks reserved for root).
 */
export interface IDiskProvider {
  folderExists(path: string): boolean;
  folderWritable(path: string): Promise<boolean>;
  getAvailableSpace(path: string): number | null;
  getTotalSize(path: string): number | null;
}

export class DiskProvider implements IDiskProvider {
  folderExists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Ported from DiskProviderBase.FolderWritable(): writes then deletes a
   * probe file in the target folder, matching the original's actual
   * write-test technique (rather than just checking permission bits, which
   * doesn't reliably detect e.g. read-only network mounts).
   */
  async folderWritable(path: string): Promise<boolean> {
    const probePath = join(path, "readarr_write_test.txt");
    try {
      await writeFile(
        probePath,
        `This file was created to verify if '${path}' is writable. It should've been automatically deleted. Feel free to delete it.`,
      );
      await rm(probePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  getAvailableSpace(path: string): number | null {
    try {
      const stats = statfsSync(path);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return null;
    }
  }

  getTotalSize(path: string): number | null {
    try {
      const stats = statfsSync(path);
      return Number(stats.blocks) * Number(stats.bsize);
    } catch {
      return null;
    }
  }
}
