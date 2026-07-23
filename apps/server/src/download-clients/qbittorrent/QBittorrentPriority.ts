/** Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentPriority.cs. */
export const QBittorrentPriority = {
  Last: 0,
  First: 1,
} as const;
export type QBittorrentPriority = (typeof QBittorrentPriority)[keyof typeof QBittorrentPriority];
