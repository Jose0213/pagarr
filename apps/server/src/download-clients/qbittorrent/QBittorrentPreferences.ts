/** Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentPreferences.cs's `QBittorrentMaxRatioAction` enum. */
export const QBittorrentMaxRatioAction = {
  Pause: 0,
  Remove: 1,
  EnableSuperSeeding: 2,
  DeleteFiles: 3,
} as const;
export type QBittorrentMaxRatioAction =
  (typeof QBittorrentMaxRatioAction)[keyof typeof QBittorrentMaxRatioAction];

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentPreferences.cs.
 * qBittorrent settings from the list returned by `/query/preferences` (v1)
 * or `/api/v2/app/preferences` (v2) -- both APIs use the same
 * snake_case field names.
 */
export interface QBittorrentPreferences {
  /** Default save path for torrents, separated by slashes. */
  save_path: string;
  /** True if share ratio limit is enabled. */
  max_ratio_enabled: boolean;
  /** The global share ratio limit. */
  max_ratio: number;
  /** True if share time limit is enabled. */
  max_seeding_time_enabled: boolean;
  /** The global share time limit in minutes. */
  max_seeding_time: number;
  /** True if share inactive time limit is enabled. */
  max_inactive_seeding_time_enabled: boolean;
  /** The global share inactive time limit in minutes. */
  max_inactive_seeding_time: number;
  /** Action performed when a torrent reaches the maximum share ratio. */
  max_ratio_act: QBittorrentMaxRatioAction;
  queueing_enabled: boolean;
  /** DHT enabled (needed for more peers and magnet downloads). */
  dht: boolean;
}

/** Ported from `QBittorrentPreferences`'s implicit default field values (C# defaults: 0/false, `QueueingEnabled = true`). */
export function createQBittorrentPreferences(
  overrides: Partial<QBittorrentPreferences> = {}
): QBittorrentPreferences {
  return {
    save_path: "",
    max_ratio_enabled: false,
    max_ratio: 0,
    max_seeding_time_enabled: false,
    max_seeding_time: 0,
    max_inactive_seeding_time_enabled: false,
    max_inactive_seeding_time: 0,
    max_ratio_act: QBittorrentMaxRatioAction.Pause,
    queueing_enabled: true,
    dht: false,
    ...overrides,
  };
}
