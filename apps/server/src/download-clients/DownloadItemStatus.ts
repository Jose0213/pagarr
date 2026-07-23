/** Ported from NzbDrone.Core/Download/DownloadItemStatus.cs. */
export const DownloadItemStatus = {
  Queued: 0,
  Paused: 1,
  Downloading: 2,
  Completed: 3,
  Failed: 4,
  Warning: 5,
} as const;
export type DownloadItemStatus = (typeof DownloadItemStatus)[keyof typeof DownloadItemStatus];
