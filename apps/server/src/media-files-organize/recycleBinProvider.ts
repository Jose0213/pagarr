import type { IExtendedDiskProvider } from "./diskProvider.js";
import {
  DiskTransferService,
  TransferMode,
  type IDiskTransferService,
} from "./diskTransferService.js";
import type { IConfigService } from "../config/configService.js";
import { RecycleBinException } from "./errors.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/RecycleBinProvider.cs.
 *
 * Directly relevant to known-issue #5 (filesystem permission friction) --
 * this is the exact code path that throws a wrapped, path-specific error
 * ("Unable to create the folder '{destinationFolder}' in the recycling bin
 * for the file '{fileName}'") when the recycle-bin target directory isn't
 * writable, rather than a bare/generic filesystem exception. Ported
 * verbatim, including the "just delete permanently" fallback when no
 * recycle bin is configured at all.
 *
 * `Execute(CleanUpRecycleBinCommand message)` (C#'s `IExecute<T>` command
 * dispatch, Messaging module, Phase 4 -- not ported yet) is exposed here as
 * a plain `execute()` method a future command dispatcher can wire up,
 * matching this port's established constructor-injection-only convention
 * (see e.g. root-folders/root-folder-service.ts's module doc comment).
 */
export interface IRecycleBinProvider {
  deleteFolder(path: string): void;
  deleteFile(path: string, subfolder?: string): void;
  empty(): void;
  cleanup(): void;
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

function withoutExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export class RecycleBinProvider implements IRecycleBinProvider {
  private readonly diskTransferService: IDiskTransferService;

  constructor(
    private readonly diskProvider: IExtendedDiskProvider,
    private readonly configService: IConfigService,
    diskTransferService?: IDiskTransferService
  ) {
    this.diskTransferService = diskTransferService ?? new DiskTransferService(diskProvider);
  }

  deleteFolder(path: string): void {
    const recyclingBin = this.configService.recycleBin;

    if (!recyclingBin || recyclingBin.trim() === "") {
      this.diskProvider.deleteFolder(path, true);
      return;
    }

    const destination = `${recyclingBin}/${fileName(path)}`;

    this.diskTransferService.transferFolder(path, destination, TransferMode.Move);

    this.diskProvider.folderSetLastWriteTime(destination, new Date());
    for (const file of this.diskProvider.getFiles(destination, true)) {
      this.setLastWriteTimeSafe(file, new Date());
    }
  }

  deleteFile(path: string, subfolder = ""): void {
    const recyclingBin = this.configService.recycleBin;

    if (!recyclingBin || recyclingBin.trim() === "") {
      this.diskProvider.deleteFile(path);
      return;
    }

    const destinationFolder = subfolder ? `${recyclingBin}/${subfolder}` : recyclingBin;
    const name = fileName(path);
    let destination = `${destinationFolder}/${name}`;

    try {
      this.diskProvider.createFolder(destinationFolder);
    } catch (e) {
      throw new RecycleBinException(
        `Unable to create the folder '${destinationFolder}' in the recycling bin for the file '${name}'`,
        { cause: e }
      );
    }

    let index = 1;
    while (this.diskProvider.fileExists(destination)) {
      index++;
      const ext = extension(name);
      destination = ext
        ? `${destinationFolder}/${withoutExtension(name)}_${index}${ext}`
        : `${destinationFolder}/${name}_${index}`;
    }

    try {
      this.diskTransferService.transferFile(path, destination, TransferMode.Move);
    } catch (e) {
      throw new RecycleBinException(
        `Unable to move '${path}' to the recycling bin: '${destination}'`,
        {
          cause: e,
        }
      );
    }

    this.setLastWriteTimeSafe(destination, new Date());
  }

  empty(): void {
    const recyclingBin = this.configService.recycleBin;

    if (!recyclingBin || recyclingBin.trim() === "") {
      return;
    }

    for (const folder of this.diskProvider.getDirectories(recyclingBin)) {
      this.diskProvider.deleteFolder(folder, true);
    }

    for (const file of this.diskProvider.getFiles(recyclingBin, false)) {
      this.diskProvider.deleteFile(file);
    }
  }

  cleanup(): void {
    const recyclingBin = this.configService.recycleBin;

    if (!recyclingBin || recyclingBin.trim() === "") {
      return;
    }

    const cleanupDays = this.configService.recycleBinCleanupDays;

    if (cleanupDays === 0) {
      return;
    }

    const cutoff = Date.now() - cleanupDays * 24 * 60 * 60 * 1000;

    for (const file of this.diskProvider.getFiles(recyclingBin, true)) {
      if (this.diskProvider.fileGetLastWrite(file).getTime() > cutoff) {
        continue;
      }

      this.diskProvider.deleteFile(file);
    }

    this.diskProvider.removeEmptySubfolders(recyclingBin);
  }

  /** Ported from `SetLastWriteTime`: swallows IOException/UnauthorizedAccessException, matching the C# source's "Invalid parameter" tolerance. */
  private setLastWriteTimeSafe(file: string, dateTime: Date): void {
    try {
      this.diskProvider.fileSetLastWriteTime(file, dateTime);
    } catch {
      // Intentional swallow, matches C# source.
    }
  }

  /** Ported from `Execute(CleanUpRecycleBinCommand message)`. See module doc comment on the Messaging-module deviation. */
  execute(): void {
    this.cleanup();
  }
}
