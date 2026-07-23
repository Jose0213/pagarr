/** Ported from NzbDrone.Core/Download/Clients/TorrentSeedConfiguration.cs. */
export interface TorrentSeedConfiguration {
  ratio: number | null;
  /** Milliseconds, matching C#'s `TimeSpan? SeedTime`. */
  seedTime: number | null;
}

/** Ported from `TorrentSeedConfiguration.DefaultConfiguration` (a static default instance, `new TorrentSeedConfiguration()`). */
export const DEFAULT_TORRENT_SEED_CONFIGURATION: TorrentSeedConfiguration = {
  ratio: null,
  seedTime: null,
};
