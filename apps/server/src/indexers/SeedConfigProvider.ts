import { DownloadProtocol } from "./DownloadProtocol.js";
import type { IIndexerRepository } from "./IndexerRepository.js";
import type { ITorrentIndexerSettings } from "./ITorrentIndexerSettings.js";

/**
 * FORWARD-REFERENCE NARROWING: ported from
 * NzbDrone.Core/Download/Clients/TorrentSeedConfiguration.cs, which lives in
 * the not-yet-ported `Download.Clients` namespace. It's a two-field plain
 * data shape with no logic of its own, so it's inlined here rather than
 * pulled in via a stub module -- a later phase porting `Download.Clients`
 * can move this without changing its shape.
 */
export interface TorrentSeedConfiguration {
  ratio: number | null;
  /** Milliseconds, mirrors the C# `TimeSpan? SeedTime`. */
  seedTimeMs: number | null;
}

/**
 * Minimal shape SeedConfigProvider needs from a `RemoteBook` (
 * NzbDrone.Core/Parser/Model/RemoteBook.cs, not yet ported -- DecisionEngine
 * / Parser module). Narrowed to exactly the fields
 * `GetSeedConfiguration(RemoteBook)` reads: the release's protocol/indexerId,
 * and whether the parsed book info represents a full discography (used to
 * pick `seedTime` vs `discographySeedTime`).
 */
export interface RemoteBookSeedInfo {
  release: { downloadProtocol: DownloadProtocol; indexerId: number };
  isDiscography: boolean;
}

/**
 * Ported from NzbDrone.Core/Indexers/SeedConfigProvider.cs. Depends on
 * `IIndexerRepository` directly (rather than `IIndexerFactory`) since the
 * C# original's `_indexerFactory.Get(indexerId)` call is `ProviderFactory`'s
 * passthrough to its repository's `Get(id)` -- catching `ModelNotFoundException`
 * -- and `IIndexerFactory` in this port (indexerFactory.ts) was narrowed to
 * only the RSS/search-enabled-filtering + Test() members Torznab/Newznab
 * actually add, not the full `ProviderFactory` CRUD surface it inherits in
 * C#. Depending on the repository directly reproduces the same lookup
 * without requiring that whole surface be re-added just for this one call.
 *
 * DEVIATION -- caching: C#'s `ICacheManager.GetRollingCache<T>(...,
 * TimeSpan.FromHours(1))` (from the not-yet-ported Common.Cache module)
 * provides a 1-hour rolling cache keyed by indexer id, invalidated on
 * `ProviderUpdatedEvent<IIndexer>`. This port fetches fresh from the
 * repository on every call instead -- nothing in this module's scope drives
 * enough call volume for the cache to matter, and adding a bespoke
 * TTL-cache here would be new infrastructure outside this module's brief.
 * A later phase porting `Common.Cache` can layer the same rolling-cache
 * behavior back in via `ICacheManager` without changing this class's public
 * surface (`getSeedConfiguration`/`getSeedConfigurationForIndexer`).
 */
export interface ISeedConfigProvider {
  getSeedConfiguration(remoteBook: RemoteBookSeedInfo): TorrentSeedConfiguration | null;
  getSeedConfigurationForIndexer(
    indexerId: number,
    fullSeason: boolean
  ): TorrentSeedConfiguration | null;
}

export class SeedConfigProvider implements ISeedConfigProvider {
  constructor(private readonly indexerRepository: IIndexerRepository) {}

  getSeedConfiguration(remoteBook: RemoteBookSeedInfo): TorrentSeedConfiguration | null {
    if (remoteBook.release.downloadProtocol !== DownloadProtocol.Torrent) {
      return null;
    }

    if (remoteBook.release.indexerId === 0) {
      return null;
    }

    return this.getSeedConfigurationForIndexer(
      remoteBook.release.indexerId,
      remoteBook.isDiscography
    );
  }

  getSeedConfigurationForIndexer(
    indexerId: number,
    fullSeason: boolean
  ): TorrentSeedConfiguration | null {
    if (indexerId === 0) {
      return null;
    }

    const seedCriteria = this.fetchSeedCriteria(indexerId);

    if (seedCriteria === null) {
      return null;
    }

    const seedTimeMinutes = fullSeason ? seedCriteria.discographySeedTime : seedCriteria.seedTime;

    return {
      ratio: seedCriteria.seedRatio,
      seedTimeMs: seedTimeMinutes != null ? seedTimeMinutes * 60 * 1000 : null,
    };
  }

  /**
   * Ported from `_indexerFactory.Get(indexerId)` wrapped in a
   * `try { ... } catch (ModelNotFoundException) { return null; }` --
   * mirrored here via `find()` (which returns `undefined` instead of
   * throwing) rather than catching an exception from `get()`.
   */
  private fetchSeedCriteria(indexerId: number): ITorrentIndexerSettings["seedCriteria"] | null {
    const definition = this.indexerRepository.find(indexerId);
    if (!definition) {
      return null;
    }

    const settings = definition.settings as Partial<ITorrentIndexerSettings> | undefined;
    return settings?.seedCriteria ?? null;
  }
}
