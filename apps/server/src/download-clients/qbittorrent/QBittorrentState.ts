/** Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentState.cs. */
export const QBittorrentState = {
  Start: 0,
  ForceStart: 1,
  Stop: 2,
} as const;
export type QBittorrentState = (typeof QBittorrentState)[keyof typeof QBittorrentState];
