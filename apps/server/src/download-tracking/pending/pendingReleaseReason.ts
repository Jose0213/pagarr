/** Ported from NzbDrone.Core/Download/Pending/PendingReleaseReason.cs. */
export enum PendingReleaseReason {
  Delay = 0,
  DownloadClientUnavailable = 1,
  Fallback = 2,
}
