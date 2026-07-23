/** Ported from NzbDrone.Core/Indexers/DownloadProtocol.cs. */
export const DownloadProtocol = {
  Unknown: 0,
  Usenet: 1,
  Torrent: 2,
} as const;
export type DownloadProtocol = (typeof DownloadProtocol)[keyof typeof DownloadProtocol];
