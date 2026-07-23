import { HttpAccept } from "../../../http/HttpAccept.js";
import { HttpRequestBuilder } from "../../../http/HttpRequestBuilder.js";
import type { BuildInfo } from "../../../http/UserAgentBuilder.js";
import type { PlexTvPinUrlResponse, PlexTvSignInUrlResponse } from "./PlexTvResponses.js";
import type { IPlexTvProxy } from "./PlexTvProxy.js";

/** Minimal slice of `IConfigService` PlexTvService needs: `PlexClientIdentifier`. */
export interface ConfigServiceLike {
  readonly plexClientIdentifier: string;
}

/**
 * Ported from NzbDrone.Core/Notifications/Plex/PlexTv/PlexTvService.cs.
 *
 * DEVIATION -- caching: the C# `_cache.Get(authToken, () => _proxy.Ping(...),
 * TimeSpan.FromHours(24))` (`ICacheManager`, from the not-yet-ported
 * `Common.Cache` module) is real, behaviorally-significant logic here -- it
 * suppresses re-pinging plex.tv for the same auth token within a 24h window
 * (not just a perf optimization the way SeedConfigProvider.ts's skipped
 * cache was -- see that file's doc comment for the "skip it, document it"
 * precedent this deviates from). Ported as a small local Map-based
 * last-pinged-at tracker keyed by auth token, same 24h window, rather than
 * pulling in a general-purpose cache abstraction for one call site. When
 * `Common.Cache`/`ICacheManager` lands, this can be swapped for the real
 * thing without changing `ping()`'s public signature.
 */
export interface IPlexTvService {
  getPinUrl(): PlexTvPinUrlResponse;
  getSignInUrl(callbackUrl: string, pinId: number, pinCode: string): PlexTvSignInUrlResponse;
  getAuthToken(pinId: number): Promise<string | null>;
  ping(authToken: string): Promise<void>;
}

const PING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class PlexTvService implements IPlexTvService {
  /** Last-pinged-at timestamp (ms since epoch) per auth token -- see this class's doc comment. */
  private readonly lastPingedAt = new Map<string, number>();

  constructor(
    private readonly proxy: IPlexTvProxy,
    private readonly configService: ConfigServiceLike,
    private readonly buildInfo: BuildInfo,
    private readonly now: () => number = () => Date.now()
  ) {}

  getPinUrl(): PlexTvPinUrlResponse {
    const clientIdentifier = this.configService.plexClientIdentifier;

    const requestBuilder = new HttpRequestBuilder("https://plex.tv/api/v2/pins")
      .accept(HttpAccept.Json)
      .addQueryParam("X-Plex-Client-Identifier", clientIdentifier)
      .addQueryParam("X-Plex-Product", this.buildInfo.appName)
      .addQueryParam("X-Plex-Platform", "Windows")
      .addQueryParam("X-Plex-Platform-Version", "7")
      .addQueryParam("X-Plex-Device-Name", this.buildInfo.appName)
      .addQueryParam("X-Plex-Version", this.buildInfo.version)
      .addQueryParam("strong", true);

    requestBuilder.post();

    const request = requestBuilder.build();

    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers) {
      headers[key] = value;
    }

    return {
      url: request.url.toString(),
      method: "POST",
      headers,
    };
  }

  getSignInUrl(callbackUrl: string, pinId: number, pinCode: string): PlexTvSignInUrlResponse {
    const clientIdentifier = this.configService.plexClientIdentifier;

    const requestBuilder = new HttpRequestBuilder("https://app.plex.tv/auth/hashBang")
      .addQueryParam("clientID", clientIdentifier)
      .addQueryParam("forwardUrl", callbackUrl)
      .addQueryParam("code", pinCode)
      .addQueryParam("context[device][product]", this.buildInfo.appName)
      .addQueryParam("context[device][platform]", "Windows")
      .addQueryParam("context[device][platformVersion]", "7")
      .addQueryParam("context[device][version]", this.buildInfo.version);

    // #! is stripped out of the URL when building, this works around it.
    //
    // Ported literally: the base URL passed to HttpRequestBuilder's ctor is
    // the literal string "https://app.plex.tv/auth/hashBang" -- "hashBang"
    // here is a deliberate placeholder token embedded in the base URL
    // itself (not a real path segment), which C# then rewrites to the
    // actual desired path fragment "#!" via `requestBuilder.Segments.Add(
    // "hashBang", "#!")`, called directly on the raw dictionary (NOT via
    // `SetSegment`, which would additionally wrap the key as "{hashBang}"
    // and require it to already be present in `{}`-brace form). `CreateUri()`
    // does a plain string Replace of the literal substring "hashBang"
    // (found in the base URL's path) with "#!", producing the final
    // "https://app.plex.tv/auth/#!?..." URL Plex's OAuth sign-in page
    // expects (a hash-bang client-side-router path) -- `Uri`/`HttpUri`
    // normally strip/percent-encode a literal "#" if it were written
    // directly into the base URL string, hence routing it through this
    // post-construction string-replace workaround instead. Ported faithfully
    // by writing directly to `segments` with the unwrapped "hashBang" key
    // (bypassing `setSegment()`'s `{segment}`-wrapping, which would look for
    // "{hashBang}" -- absent here -- and throw "Segment is not defined").
    requestBuilder.segments.set("hashBang", "#!");

    const request = requestBuilder.build();

    return {
      oauthUrl: request.url.toString(),
      pinId,
    };
  }

  async getAuthToken(pinId: number): Promise<string | null> {
    return this.proxy.getAuthToken(this.configService.plexClientIdentifier, pinId);
  }

  async ping(authToken: string): Promise<void> {
    // Ping plex.tv if we haven't done so in the last 24 hours for this auth token.
    const last = this.lastPingedAt.get(authToken);
    const nowMs = this.now();

    if (last !== undefined && nowMs - last < PING_CACHE_TTL_MS) {
      return;
    }

    await this.proxy.ping(this.configService.plexClientIdentifier, authToken);
    this.lastPingedAt.set(authToken, nowMs);
  }
}
