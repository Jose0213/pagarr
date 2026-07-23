/**
 * Ported from NzbDrone.Core/MetadataSource/MetadataRequestBuilder.cs.
 *
 * C# original: a single `MetadataRequestBuilder` that returns an
 * `IHttpRequestBuilderFactory` pointed either at `_configService.MetadataSource`
 * (a user-configurable override, e.g. for self-hosting a metadata proxy) or
 * a hardcoded default (`IReadarrCloudRequestBuilder.Metadata`, Readarr's own
 * bookinfo.club-fronting cloud endpoint) when no override is set.
 *
 * This module has three independent providers instead of one, so the
 * "one configurable base URL with one hardcoded default" shape is kept but
 * genericized over a provider name -- each provider gets its own optional
 * override key (so a self-hoster could point any single provider at a
 * mirror/proxy without affecting the others) and its own real default base
 * URL (Hardcover/OpenLibrary/Google Books, not bookinfo.club).
 *
 * Unlike the C# version, there's no ConfigService dependency wired in here
 * (Phase 1's `IConfigService` -- see config/configService.ts -- has a single
 * `metadataSource` string field mirroring the C# shape 1:1, but plumbing a
 * *per-provider* override through it is new surface, not a faithful port of
 * an existing field, so it's deliberately left as a plain constructor
 * parameter here for the reviewer to wire to config during merge).
 */

import { HttpRequestBuilder, type IHttpRequestBuilderFactory } from "../http/index.js";

export interface IMetadataRequestBuilder {
  getRequestBuilder(): IHttpRequestBuilderFactory;
}

/**
 * Ported from MetadataRequestBuilder: `GetRequestBuilder()` returns a
 * factory rooted at `configuredBaseUrl` (trimmed of a trailing slash) if
 * set, else `defaultBaseUrl`. `.KeepAlive()` is preserved from the C#
 * original (`new HttpRequestBuilder(...).KeepAlive().CreateFactory()`).
 */
export class MetadataRequestBuilder implements IMetadataRequestBuilder {
  private readonly defaultBaseUrl: string;
  private readonly configuredBaseUrl: string | null | undefined;

  constructor(defaultBaseUrl: string, configuredBaseUrl?: string | null) {
    this.defaultBaseUrl = defaultBaseUrl;
    this.configuredBaseUrl = configuredBaseUrl;
  }

  getRequestBuilder(): IHttpRequestBuilderFactory {
    const base =
      this.configuredBaseUrl !== null &&
      this.configuredBaseUrl !== undefined &&
      this.configuredBaseUrl.trim() !== ""
        ? trimTrailingSlash(this.configuredBaseUrl)
        : this.defaultBaseUrl;

    return new HttpRequestBuilder(base).keepAlive().createFactory();
  }
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end--;
  }
  return value.slice(0, end);
}
