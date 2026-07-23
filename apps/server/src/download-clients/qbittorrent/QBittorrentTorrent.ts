/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentTorrent.cs.
 * Field names left in qBittorrent's own snake_case JSON shape (matching the
 * `[JsonProperty(PropertyName = "...")]` mappings in the C# source) since
 * this is a raw-wire-shape DTO, same convention as `SabnzbdQueueItem.ts`.
 */
export interface QBittorrentTorrent {
  /** Torrent hash. */
  hash: string;
  /** Torrent name. */
  name: string;
  /** Torrent size (bytes). */
  size: number;
  /** Torrent progress (%/100). */
  progress: number;
  /**
   * Torrent ETA (seconds). C# types this `BigInteger` since qBittorrent can
   * send values exceeding `ulong` -- `number` is sufficient here since JS
   * numbers safely hold qBittorrent's actual eta range (capped well below
   * `Number.MAX_SAFE_INTEGER`, e.g. its documented "unknown" sentinel of
   * 8640000).
   */
  eta: number;
  /** Torrent state. See the QBittorrentState-adjacent switch in QBittorrent.ts's `getItems()`. */
  state: string;
  /** Label of the torrent. */
  label: string;
  /** Category of the torrent (3.3.5+). */
  category: string;
  /** Torrent save path. */
  save_path: string;
  /** Torrent content path. */
  content_path: string;
  /** Torrent share ratio. */
  ratio: number;
  /** Per torrent seeding ratio limit (-2 = use global, -1 = unlimited). */
  ratio_limit: number;
  /** Torrent seeding time (in seconds, not provided by the list api). */
  seeding_time: number | null;
  /** Per torrent seeding time limit (-2 = use global, -1 = unlimited). */
  seeding_time_limit: number;
  /** Per torrent inactive seeding time limit (-2 = use global, -1 = unlimited). */
  inactive_seeding_time_limit: number;
  /** Timestamp in unix seconds when a chunk was last downloaded/uploaded. */
  last_activity: number;
}

/** Ported from `QBittorrentTorrent`'s default field values (`RatioLimit = -2`, `SeedingTimeLimit = -2`, `InactiveSeedingTimeLimit = -2`). */
export function createQBittorrentTorrent(
  overrides: Partial<QBittorrentTorrent> = {}
): QBittorrentTorrent {
  return {
    hash: "",
    name: "",
    size: 0,
    progress: 0,
    eta: 0,
    state: "",
    label: "",
    category: "",
    save_path: "",
    content_path: "",
    ratio: 0,
    ratio_limit: -2,
    seeding_time: null,
    seeding_time_limit: -2,
    inactive_seeding_time_limit: -2,
    last_activity: 0,
    ...overrides,
  };
}

/** Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentTorrent.cs's `QBittorrentTorrentProperties`. */
export interface QBittorrentTorrentProperties {
  /** Torrent hash. */
  hash: string;
  save_path: string;
  /** Torrent seeding time (in seconds). */
  seeding_time: number;
}

/** Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentTorrent.cs's `QBittorrentTorrentFile`. */
export interface QBittorrentTorrentFile {
  name: string;
}
