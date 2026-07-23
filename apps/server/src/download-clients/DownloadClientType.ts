/** Ported from NzbDrone.Core/Download/DownloadClientType.cs. */
export const DownloadClientType = {
  Sabnzbd: 0,
  Blackhole: 1,
  Pneumatic: 2,
  Nzbget: 3,
} as const;
export type DownloadClientType = (typeof DownloadClientType)[keyof typeof DownloadClientType];
