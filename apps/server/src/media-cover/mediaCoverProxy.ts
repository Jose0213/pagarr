import type { IHttpClient } from "../http/HttpClient.js";
import { HttpRequest } from "../http/HttpRequest.js";
import { sha256Hash } from "../extras/hashing.js";

/**
 * Ported from NzbDrone.Core/MediaCover/MediaCoverProxy.cs.
 *
 * Proxies a not-yet-locally-cached remote cover URL (used for authors not
 * yet added to Readarr, id 0 -- see `mediaCoverService.ts`'s
 * `convertToLocalUrls`) through a same-origin URL, avoiding referrer/CORS
 * issues the frontend would hit hot-linking the real remote image host
 * directly.
 *
 * DEVIATIONS:
 *  - `ICacheManager.GetCache<string>(GetType())` (the not-yet-ported
 *    `NzbDrone.Common.Cache` module) is replaced with a plain
 *    `Map<hash, { url, expiresAt }>` plus manual expiry, matching this
 *    port's established "replace ICacheManager/ICached with a plain Map +
 *    explicit TTL" convention (see `config/configFileProvider.ts`'s module
 *    doc comment, and `qualities/qualityDefinitionService.ts`'s identical
 *    deviation note for the general pattern). The 24-hour TTL
 *    (`TimeSpan.FromHours(24)`) and the `ClearExpired()` call after every
 *    `Set` are both preserved faithfully.
 *  - `IConfigFileProvider.UrlBase`: `config/configFileProvider.ts` is
 *    already a real ported module (`ConfigFileProvider.urlBase`), used
 *    directly here rather than forward-referenced.
 *  - `SHA256Hash()`: reuses `extras/hashing.ts`'s already-ported
 *    `sha256Hash`, rather than re-implementing it locally -- unlike most
 *    small string-extension helpers this port re-derives per-module
 *    (`fileNameFromPath` etc.), SHA-256 hashing has zero variation across
 *    call sites, so importing the one existing implementation is strictly
 *    better than a third copy.
 */

/** Narrowed slice of `IConfigFileProvider` this proxy calls -- see `config/configFileProvider.ts`'s real `ConfigFileProvider.urlBase` getter. */
export interface MediaCoverProxyUrlBaseProvider {
  readonly urlBase: string;
}

export interface IMediaCoverProxy {
  registerUrl(url: string | null | undefined): string | null;
  getUrl(hash: string): string;
  getImage(hash: string): Promise<Uint8Array | null>;
}

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class MediaCoverProxy implements IMediaCoverProxy {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly configFileProvider: MediaCoverProxyUrlBaseProvider
  ) {}

  /** Ported from `MediaCoverProxy.RegisterUrl(string url)`. */
  registerUrl(url: string | null | undefined): string | null {
    if (isNullOrWhiteSpace(url)) {
      return null;
    }

    const hash = sha256Hash(url);

    this.cacheSet(hash, url, CACHE_TTL_MS);
    this.clearExpired();

    const fileName = fileNameFromPath(url);
    return this.configFileProvider.urlBase + "/MediaCoverProxy/" + hash + "/" + fileName;
  }

  /** Ported from `MediaCoverProxy.GetUrl(string hash)`. Throws (mirroring C#'s `KeyNotFoundException`) if the hash isn't in the cache (expired or never registered). */
  getUrl(hash: string): string {
    const result = this.cacheFind(hash);

    if (result === null) {
      throw new Error("Url no longer in cache");
    }

    return result;
  }

  /** Ported from `MediaCoverProxy.GetImage(string hash)`. */
  async getImage(hash: string): Promise<Uint8Array | null> {
    const url = this.getUrl(hash);

    const request = new HttpRequest(url);

    const response = await this.httpClient.get(request);
    return response.responseData;
  }

  private cacheSet(hash: string, url: string, ttlMs: number): void {
    this.cache.set(hash, { url, expiresAt: Date.now() + ttlMs });
  }

  private cacheFind(hash: string): string | null {
    const entry = this.cache.get(hash);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(hash);
      return null;
    }

    return entry.url;
  }

  private clearExpired(): void {
    const now = Date.now();
    for (const [hash, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(hash);
      }
    }
  }
}

function isNullOrWhiteSpace(value: string | null | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value.trim() === "";
}

/** Ported from `Path.GetFileName(path)`, cross-platform-separator-agnostic -- same local port as `custom-formats/customFormatCalculationService.ts`'s `fileNameFromPath`. */
function fileNameFromPath(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}
