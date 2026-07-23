import { DownloadClientException } from "../DownloadClientException.js";
import type { QBittorrentLabel } from "./QBittorrentLabel.js";
import type { QBittorrentPreferences } from "./QBittorrentPreferences.js";
import type { QBittorrentSettings } from "./QBittorrentSettings.js";
import type {
  QBittorrentTorrent,
  QBittorrentTorrentFile,
  QBittorrentTorrentProperties,
} from "./QBittorrentTorrent.js";
import type { TorrentSeedConfiguration } from "../TorrentSeedConfiguration.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentProxySelector.cs's
 * `IQBittorrentProxy` interface.
 *
 * `Version` (`.NET System.Version`, dotted major.minor.build.revision) is
 * ported as a plain string throughout this proxy pair, compared via
 * `compareVersions()` (see below) rather than a ported `Version` class --
 * qBittorrent's API version strings (`"1.5"`, `"2.8.1"`, `"4.2alpha"`) only
 * ever need ordinal numeric-segment comparison, which `compareVersions()`
 * provides without needing the full `System.Version` parsing/formatting
 * surface.
 */
export interface IQBittorrentProxy {
  isApiSupported(settings: QBittorrentSettings): Promise<boolean>;
  getApiVersion(settings: QBittorrentSettings): Promise<string>;
  getVersion(settings: QBittorrentSettings): Promise<string>;
  getConfig(settings: QBittorrentSettings): Promise<QBittorrentPreferences>;
  getTorrents(settings: QBittorrentSettings): Promise<QBittorrentTorrent[]>;
  isTorrentLoaded(hash: string, settings: QBittorrentSettings): Promise<boolean>;
  getTorrentProperties(
    hash: string,
    settings: QBittorrentSettings
  ): Promise<QBittorrentTorrentProperties>;
  getTorrentFiles(hash: string, settings: QBittorrentSettings): Promise<QBittorrentTorrentFile[]>;

  addTorrentFromUrl(
    torrentUrl: string,
    seedConfiguration: TorrentSeedConfiguration | null,
    settings: QBittorrentSettings
  ): Promise<void>;
  addTorrentFromFile(
    fileName: string,
    fileContent: Uint8Array,
    seedConfiguration: TorrentSeedConfiguration | null,
    settings: QBittorrentSettings
  ): Promise<void>;

  removeTorrent(hash: string, removeData: boolean, settings: QBittorrentSettings): Promise<void>;
  setTorrentLabel(hash: string, label: string, settings: QBittorrentSettings): Promise<void>;
  addLabel(label: string, settings: QBittorrentSettings): Promise<void>;
  getLabels(settings: QBittorrentSettings): Promise<Record<string, QBittorrentLabel>>;
  setTorrentSeedingConfiguration(
    hash: string,
    seedConfiguration: TorrentSeedConfiguration,
    settings: QBittorrentSettings
  ): Promise<void>;
  moveTorrentToTopInQueue(hash: string, settings: QBittorrentSettings): Promise<void>;
  setForceStart(hash: string, enabled: boolean, settings: QBittorrentSettings): Promise<void>;
}

export interface IQBittorrentProxySelector {
  getProxy(settings: QBittorrentSettings, force?: boolean): Promise<IQBittorrentProxy>;
  getApiVersion(settings: QBittorrentSettings, force?: boolean): Promise<string>;
}

/** Minimal logger surface QBittorrentProxySelector needs. */
export interface QBittorrentProxySelectorLogger {
  trace(message: string, ...args: unknown[]): void;
}

const noopLogger: QBittorrentProxySelectorLogger = { trace: () => {} };

/**
 * Ported from `Version.Parse` comparison semantics as used by
 * QBittorrent.cs/QBittorrentProxyV1.cs/QBittorrentProxyV2.cs: numeric
 * segment-by-segment comparison, treating a missing trailing segment as `0`
 * (`Version.Parse("1.5")` < `Version.Parse("1.5.1")`). Non-numeric segments
 * (e.g. the `alpha` suffix stripped by `GetVersion` before it ever reaches a
 * `Version.Parse` call, or a version string this port can't parse) sort as
 * `0` for that segment -- matching a defensive "treat unparsable as
 * earliest" rather than throwing, since no in-scope caller relies on
 * `Version.Parse`'s actual `FormatException` behavior for malformed input.
 */
export function compareVersions(a: string, b: string): number {
  const segA = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const segB = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const length = Math.max(segA.length, segB.length);

  for (let i = 0; i < length; i++) {
    const diff = (segA[i] ?? 0) - (segB[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

export function versionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

export function versionLt(a: string, b: string): boolean {
  return compareVersions(a, b) < 0;
}

interface CacheEntry {
  proxy: IQBittorrentProxy;
  apiVersion: string;
}

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentProxySelector.cs.
 *
 * DEVIATION -- caching: C#'s `ICacheManager.GetCache<Tuple<IQBittorrentProxy,
 * Version>>()` with a 10-minute TTL (from the not-yet-ported Common.Cache
 * module) is ported here as a plain in-memory `Map` with the same 10-minute
 * TTL hand-rolled via a stored timestamp, since the whole point of this
 * cache (avoid re-probing `/api/v2/app/webapiVersion` on every single
 * qBittorrent call) is genuinely load-bearing behavior for this proxy, not
 * a performance nicety safe to drop the way `indexers/SeedConfigProvider.ts`'s
 * doc comment argues for its own (truly negligible-volume) cache omission.
 */
export class QBittorrentProxySelector implements IQBittorrentProxySelector {
  private readonly cache = new Map<string, { entry: CacheEntry; expiresAtMs: number }>();
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(
    private readonly proxyV1: IQBittorrentProxy,
    private readonly proxyV2: IQBittorrentProxy,
    private readonly logger: QBittorrentProxySelectorLogger = noopLogger,
    private readonly now: () => number = () => Date.now()
  ) {}

  async getProxy(settings: QBittorrentSettings, force = false): Promise<IQBittorrentProxy> {
    return (await this.getProxyCache(settings, force)).proxy;
  }

  async getApiVersion(settings: QBittorrentSettings, force = false): Promise<string> {
    return (await this.getProxyCache(settings, force)).apiVersion;
  }

  private async getProxyCache(settings: QBittorrentSettings, force: boolean): Promise<CacheEntry> {
    const proxyKey = `${settings.host}_${settings.port}`;

    if (force) {
      this.cache.delete(proxyKey);
    }

    const cached = this.cache.get(proxyKey);
    if (cached && cached.expiresAtMs > this.now()) {
      return cached.entry;
    }

    const entry = await this.fetchProxy(settings);
    this.cache.set(proxyKey, { entry, expiresAtMs: this.now() + this.ttlMs });
    return entry;
  }

  private async fetchProxy(settings: QBittorrentSettings): Promise<CacheEntry> {
    if (await this.proxyV2.isApiSupported(settings)) {
      this.logger.trace("Using qbitTorrent API v2");
      return { proxy: this.proxyV2, apiVersion: await this.proxyV2.getApiVersion(settings) };
    }

    if (await this.proxyV1.isApiSupported(settings)) {
      this.logger.trace("Using qbitTorrent API v1");
      return { proxy: this.proxyV1, apiVersion: await this.proxyV1.getApiVersion(settings) };
    }

    throw new DownloadClientException("Unable to determine qBittorrent API version");
  }
}
