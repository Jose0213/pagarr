import { parseBookTitle } from "../parser/parser.js";
import type {
  ISeedConfigProvider,
  TorrentSeedConfiguration,
} from "../indexers/SeedConfigProvider.js";
import type { IDownloadHistoryService } from "./history/downloadHistoryService.js";

/**
 * Ported from NzbDrone.Core/Download/DownloadSeedConfigProvider.cs.
 *
 * DEVIATION -- caching: C#'s `ICacheManager.GetRollingCache<
 * CachedSeedConfiguration>(GetType(), "indexerByHash", TimeSpan.FromHours(1))`
 * (Common.Cache, not ported) is a 1-hour rolling cache keyed by info hash.
 * Reproduced with a small private TTL-Map cache scoped to this service
 * instance, same approach as `profiles/delay/delayProfileService.ts`'s
 * `TtlCache` and `download-tracking/remote-path-mappings/
 * remotePathMappingService.ts`'s single-entry variant.
 *
 * No NLog Logger -- per this port's no-NLog-yet convention (the
 * `_logger.Debug` calls on the "couldn't find anything" paths are omitted).
 */
export interface IDownloadSeedConfigProvider {
  getSeedConfiguration(infoHash: string): TorrentSeedConfiguration | null;
}

interface CachedSeedConfiguration {
  indexerId: number;
  discography: boolean;
}

class TtlMapCache<T> {
  private readonly entries = new Map<string, { value: T | null; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string, factory: () => T | null): T | null {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.value;
    }
    const value = factory();
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }
}

export class DownloadSeedConfigProvider implements IDownloadSeedConfigProvider {
  private readonly cacheDownloads = new TtlMapCache<CachedSeedConfiguration>(60 * 60 * 1000);

  constructor(
    private readonly downloadHistoryService: IDownloadHistoryService,
    private readonly indexerSeedConfigProvider: ISeedConfigProvider
  ) {}

  getSeedConfiguration(infoHash: string): TorrentSeedConfiguration | null {
    if (!infoHash || infoHash.trim() === "") {
      return null;
    }

    const upperHash = infoHash.toUpperCase();

    const cachedConfig = this.cacheDownloads.get(upperHash, () => this.fetchIndexer(upperHash));

    if (cachedConfig === null) {
      return null;
    }

    return this.indexerSeedConfigProvider.getSeedConfigurationForIndexer(
      cachedConfig.indexerId,
      cachedConfig.discography
    );
  }

  private fetchIndexer(infoHash: string): CachedSeedConfiguration | null {
    const historyItem = this.downloadHistoryService.getLatestGrab(infoHash);

    if (historyItem === undefined) {
      return null;
    }

    const parsedBookInfo =
      historyItem.release !== null ? parseBookTitle(historyItem.release.title ?? "") : null;

    if (parsedBookInfo === null) {
      return null;
    }

    return {
      indexerId: historyItem.indexerId ?? 0,
      discography: parsedBookInfo.discography,
    };
  }
}
