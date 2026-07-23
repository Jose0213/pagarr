/** Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentContentLayout.cs. */
export const QBittorrentContentLayout = {
  Default: 0,
  Original: 1,
  Subfolder: 2,
} as const;
export type QBittorrentContentLayout =
  (typeof QBittorrentContentLayout)[keyof typeof QBittorrentContentLayout];
