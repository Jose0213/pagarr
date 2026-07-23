import { existsSync, closeSync, openSync, readSync, unlinkSync } from "node:fs";
import { rmSync } from "node:fs";

/**
 * Ported from the slice of NzbDrone.Common/Disk/IDiskProvider.cs (and its
 * DiskProviderBase.cs / platform DiskProvider.cs implementations) that this
 * module's two disk-touching housekeepers need:
 * `CleanupTemporaryUpdateFiles` (FolderExists/DeleteFolder) and
 * `DeleteBadMediaCovers` (OpenReadStream/DeleteFile).
 *
 * `root-folders/disk-provider.ts` and `media-files-organize/diskProvider.ts`
 * each already port a *different* slice of the same real C# `IDiskProvider`
 * interface (see their own doc comments for why: per-module task scoping
 * meant neither could be extended in place by a later module's worktree).
 * This is a third, disjoint partial port of the same source interface,
 * following the same convention -- camelCase method names mirroring the C#
 * PascalCase originals, so a future full `IDiskProvider` port (a dedicated
 * Common/Disk module) can absorb all three call sites without changing any
 * of their callers.
 *
 * `readHeaderBytes` has no direct 1:1 C# method name -- it stands in for
 * `IDiskProvider.OpenReadStream(path)` narrowed to exactly what
 * `DeleteBadMediaCovers.IsValid` does with the stream (read the first N
 * bytes, then stop; the C# `using` block closes the stream immediately
 * after). Implemented with `openSync`/`readSync`/`closeSync` rather than
 * `readFileSync` so it never reads more than the requested byte count off
 * disk, matching the original's partial-read intent (avoids loading a
 * potentially large "corrupt cover is actually an HTML error page" file
 * fully into memory just to sniff its first few bytes).
 */
export interface IHousekeepingDiskProvider {
  folderExists(path: string): boolean;
  deleteFolder(path: string, recursive: boolean): void;
  fileExists(path: string): boolean;
  deleteFile(path: string): void;
  /**
   * Reads up to `length` bytes from the start of the file at `path`.
   * Returns fewer than `length` bytes (possibly zero) if the file is
   * shorter -- ported from `Stream.Read(buffer, 0, buffer.Length)`'s
   * "may return less than requested" semantics.
   */
  readHeaderBytes(path: string, length: number): Buffer;
}

export class HousekeepingDiskProvider implements IHousekeepingDiskProvider {
  folderExists(path: string): boolean {
    return existsSync(path);
  }

  deleteFolder(path: string, recursive: boolean): void {
    rmSync(path, { recursive, force: true });
  }

  fileExists(path: string): boolean {
    return existsSync(path);
  }

  deleteFile(path: string): void {
    unlinkSync(path);
  }

  readHeaderBytes(path: string, length: number): Buffer {
    const fd = openSync(path, "r");
    try {
      const buffer = Buffer.alloc(length);
      const bytesRead = readSync(fd, buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      closeSync(fd);
    }
  }
}
