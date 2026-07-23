import { createHash } from "node:crypto";
import { OsPath } from "../OsPath.js";
import { DownloadItemStatus } from "../DownloadItemStatus.js";
import type { IDiskProviderLike } from "../IDiskProviderLike.js";
import { cleanFileName } from "../fileNameCleaner.js";
import { createWatchFolderItem, type WatchFolderItem } from "./WatchFolderItem.js";
import type { DiskScanFileInfo, IDiskScanServiceLike } from "./IDiskScanServiceLike.js";

/** Minimal logger surface ScanWatchFolder needs. */
export interface ScanWatchFolderLogger {
  trace(message: string, ...args: unknown[]): void;
}

const noopLogger: ScanWatchFolderLogger = { trace: () => {} };

export interface IScanWatchFolder {
  getItems(watchFolder: string, waitPeriodMs: number): Promise<WatchFolderItem[]>;
}

/**
 * Ported from NzbDrone.Core/Download/Clients/Blackhole/ScanWatchFolder.cs.
 *
 * DEVIATION -- cache: C#'s `ICacheManager.GetCache<Dictionary<string,
 * WatchFolderItem>>()` (no explicit TTL on the cache itself; the 5-minute
 * `Set()` call at the end of `GetItems` is what actually matters) is a
 * genuinely load-bearing "remember what we last saw per watch folder" map
 * used to detect *changes* between scans (`PreCheckWatchItemExpiry`/
 * `UpdateWatchItemExpiry` compare against the previous scan's entry for the
 * same `DownloadId`) -- not a performance nicety. Ported as a plain instance
 * `Map<string, Map<string, WatchFolderItem>>` keyed by watch folder path,
 * with the same 5-minute per-`Set()` expiry hand-rolled via a stored
 * timestamp, matching `QBittorrentProxySelector.ts`'s "genuinely
 * load-bearing" rationale for keeping equivalent caches.
 */
export class ScanWatchFolder implements IScanWatchFolder {
  private readonly watchFolderItemCache = new Map<
    string,
    { entries: Map<string, WatchFolderItem>; expiresAtMs: number }
  >();

  constructor(
    private readonly diskScanService: IDiskScanServiceLike,
    private readonly diskProvider: IDiskProviderLike,
    private readonly logger: ScanWatchFolderLogger = noopLogger,
    private readonly now: () => number = () => Date.now()
  ) {}

  async getItems(watchFolder: string, waitPeriodMs: number): Promise<WatchFolderItem[]> {
    const cached = this.watchFolderItemCache.get(watchFolder);
    const lastWatchItems: Map<string, WatchFolderItem> =
      cached && cached.expiresAtMs > this.now()
        ? cached.entries
        : new Map<string, WatchFolderItem>();

    const newWatchItems = new Map<string, WatchFolderItem>();

    for (const newWatchItem of await this.getDownloadItems(
      watchFolder,
      lastWatchItems,
      waitPeriodMs
    )) {
      newWatchItems.set(newWatchItem.downloadId, newWatchItem);
    }

    this.watchFolderItemCache.set(watchFolder, {
      entries: newWatchItems,
      expiresAtMs: this.now() + 5 * 60 * 1000,
    });

    return [...newWatchItems.values()];
  }

  private async getDownloadItems(
    watchFolder: string,
    lastWatchItems: Map<string, WatchFolderItem>,
    waitPeriodMs: number
  ): Promise<WatchFolderItem[]> {
    const result: WatchFolderItem[] = [];

    const directories = await this.diskProvider.getDirectories(watchFolder);
    for (const folder of this.diskScanService.filterPaths(watchFolder, directories)) {
      const folderName = lastPathSegment(folder);
      const title = cleanFileName(folderName);

      const creationTimeMs = await this.diskProvider.folderGetCreationTime(folder);

      const newWatchItem = createWatchFolderItem({
        downloadId: `${folderName}_${creationTimeMs}`,
        title,
        outputPath: new OsPath(folder),
        status: DownloadItemStatus.Completed,
        remainingTime: 0,
      });

      const oldWatchItem = lastWatchItems.get(newWatchItem.downloadId);

      if (this.preCheckWatchItemExpiry(newWatchItem, oldWatchItem)) {
        const files = await this.diskProvider.getFiles(folder, true);

        let totalSize = 0;
        for (const file of files) {
          totalSize += await this.diskProvider.getFileSize(file);
        }
        newWatchItem.totalSize = totalSize;
        newWatchItem.hash = await this.getFolderHash(folder, files);

        let anyLocked = false;
        for (const file of files) {
          if (await this.diskProvider.isFileLocked(file)) {
            anyLocked = true;
            break;
          }
        }

        if (anyLocked) {
          newWatchItem.status = DownloadItemStatus.Downloading;
          newWatchItem.remainingTime = null;
        }

        this.updateWatchItemExpiry(newWatchItem, oldWatchItem, waitPeriodMs);
      }

      result.push(newWatchItem);
    }

    const bookFiles = await this.diskScanService.getBookFiles(watchFolder, false);
    for (const audioFile of this.diskScanService.filterFiles(watchFolder, bookFiles)) {
      const title = cleanFileName(audioFile.name);

      const newWatchItem = createWatchFolderItem({
        downloadId: `${audioFile.name}_${audioFile.lastWriteTimeMs}`,
        title,
        outputPath: new OsPath(audioFile.fullName),
        status: DownloadItemStatus.Completed,
        remainingTime: 0,
      });

      const oldWatchItem = lastWatchItems.get(newWatchItem.downloadId);

      if (this.preCheckWatchItemExpiry(newWatchItem, oldWatchItem)) {
        newWatchItem.totalSize = audioFile.length;
        newWatchItem.hash = this.getFileHash(
          audioFile.fullName,
          audioFile.lastWriteTimeMs,
          audioFile.length
        );

        if (await this.diskProvider.isFileLocked(audioFile.fullName)) {
          newWatchItem.status = DownloadItemStatus.Downloading;
        }

        this.updateWatchItemExpiry(newWatchItem, oldWatchItem, waitPeriodMs);
      }

      result.push(newWatchItem);
    }

    return result;
  }

  private preCheckWatchItemExpiry(
    newWatchItem: WatchFolderItem,
    oldWatchItem: WatchFolderItem | undefined
  ): boolean {
    if (!oldWatchItem || oldWatchItem.lastChangedMs + 60 * 60 * 1000 > this.now()) {
      return true;
    }

    newWatchItem.totalSize = oldWatchItem.totalSize;
    newWatchItem.hash = oldWatchItem.hash;

    return false;
  }

  private updateWatchItemExpiry(
    newWatchItem: WatchFolderItem,
    oldWatchItem: WatchFolderItem | undefined,
    waitPeriodMs: number
  ): void {
    if (oldWatchItem && newWatchItem.hash === oldWatchItem.hash) {
      newWatchItem.lastChangedMs = oldWatchItem.lastChangedMs;
    } else {
      newWatchItem.lastChangedMs = this.now();
    }

    const remainingTimeMs = waitPeriodMs - (this.now() - newWatchItem.lastChangedMs);

    if (remainingTimeMs > 0) {
      newWatchItem.remainingTime = remainingTimeMs;
      newWatchItem.status = DownloadItemStatus.Downloading;
    }
  }

  private async getFolderHash(folder: string, files: string[]): Promise<string> {
    let data = folder;
    try {
      const lastWrite = await this.diskProvider.folderGetLastWrite(folder);
      data += String(lastWrite);
    } catch (ex) {
      this.logger.trace("Ignored hashing error during scan for %s", folder, ex);
    }

    for (const file of [...files].sort((a, b) => a.localeCompare(b))) {
      data += await this.getFileHashAsync(file);
    }

    return sha1Hex(data);
  }

  private async getFileHashAsync(file: string): Promise<string> {
    let data = file;
    try {
      const lastWrite = await this.diskProvider.fileGetLastWrite(file);
      const size = await this.diskProvider.getFileSize(file);
      data += String(lastWrite) + String(size);
    } catch (ex) {
      this.logger.trace("Ignored hashing error during scan for %s", file, ex);
    }

    return sha1Hex(data);
  }

  /** Sync variant for the "audio file" branch, where lastWriteTimeMs/length are already known from `DiskScanFileInfo`. */
  private getFileHash(file: string, lastWriteTimeMs: number, length: number): string {
    const data = file + String(lastWriteTimeMs) + String(length);
    return sha1Hex(data);
  }
}

function lastPathSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

function sha1Hex(data: string): string {
  return createHash("sha1").update(data, "utf8").digest("hex");
}

export type { DiskScanFileInfo };
