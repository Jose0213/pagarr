import { OsPath } from "../OsPath.js";
import type { DownloadItemStatus } from "../DownloadItemStatus.js";

/** Ported from NzbDrone.Core/Download/Clients/Blackhole/WatchFolderItem.cs. */
export interface WatchFolderItem {
  downloadId: string;
  title: string;
  totalSize: number;
  /** Milliseconds, matching C#'s `TimeSpan? RemainingTime`. */
  remainingTime: number | null;
  outputPath: OsPath;
  status: DownloadItemStatus;

  /** Milliseconds since epoch, matching C#'s `DateTime LastChanged`. */
  lastChangedMs: number;
  hash: string | null;
}

export function createWatchFolderItem(overrides: Partial<WatchFolderItem> = {}): WatchFolderItem {
  return {
    downloadId: "",
    title: "",
    totalSize: 0,
    remainingTime: null,
    outputPath: OsPath.empty(),
    status: 0,
    lastChangedMs: 0,
    hash: null,
    ...overrides,
  };
}
