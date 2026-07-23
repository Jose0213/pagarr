import { HttpAccept } from "../../../http/HttpAccept.js";
import { HttpException } from "../../../http/HttpException.js";
import { HttpRequestBuilder } from "../../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import type { BuildInfo } from "../../../http/UserAgentBuilder.js";
import { PlexAuthenticationException, PlexException } from "../PlexException.js";
import type {
  PlexError,
  PlexIdentity,
  PlexMediaContainerLegacy,
  PlexResponse,
  PlexSection,
  PlexSectionsContainer,
} from "./PlexServerModels.js";
import type { PlexServerSettings } from "./PlexServerSettings.js";

/** Ported from `StringExtensions.ToUrlHost()`: wraps an IPv6 literal host in `[...]` for use in a URL authority, leaves anything else untouched. */
function toUrlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

/**
 * Ported from NzbDrone.Core/Notifications/Plex/Server/PlexServerProxy.cs.
 */
/** Minimal logger surface PlexServerProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface PlexServerProxyLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface IPlexServerProxy {
  getTvSections(settings: PlexServerSettings): Promise<PlexSection[]>;
  version(settings: PlexServerSettings): Promise<string>;
  update(sectionId: number, path: string, settings: PlexServerSettings): Promise<void>;
}

export class PlexServerProxy implements IPlexServerProxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly configService: { readonly plexClientIdentifier: string },
    private readonly buildInfo: BuildInfo,
    private readonly logger: PlexServerProxyLogger
  ) {}

  async getTvSections(settings: PlexServerSettings): Promise<PlexSection[]> {
    const request = this.buildRequest("library/sections", "GET", settings);
    const response = await this.processRequest(request);

    this.checkForError(response);

    if (response.includes("_children")) {
      const legacy = JSON.parse(response) as PlexMediaContainerLegacy;
      return (legacy.sections ?? [])
        .filter((d) => d.type === "artist")
        .map((s) => ({
          id: s.id,
          language: s.language,
          locations: s.locations,
          type: s.type,
        }));
    }

    const parsed = JSON.parse(response) as PlexResponse<PlexSectionsContainer>;
    return (parsed.mediaContainer?.sections ?? []).filter((d) => d.type === "artist");
  }

  async update(sectionId: number, path: string, settings: PlexServerSettings): Promise<void> {
    const resource = `library/sections/${sectionId}/refresh`;
    const request = this.buildRequest(resource, "GET", settings);

    request.addQueryParam("path", path);

    const response = await this.processRequest(request);

    this.checkForError(response);
  }

  async version(settings: PlexServerSettings): Promise<string> {
    const request = this.buildRequest("identity", "GET", settings);
    const response = await this.processRequest(request);

    this.checkForError(response);

    if (response.includes("_children")) {
      return (JSON.parse(response) as PlexIdentity).version;
    }

    return (JSON.parse(response) as PlexResponse<PlexIdentity>).mediaContainer.version;
  }

  private buildRequest(
    resource: string,
    method: "GET",
    settings: PlexServerSettings
  ): HttpRequestBuilder {
    const scheme = settings.useSsl ? "https" : "http";

    const requestBuilder = new HttpRequestBuilder(
      `${scheme}://${toUrlHost(settings.host)}:${settings.port}${settings.urlBase}`
    )
      .accept(HttpAccept.Json)
      .addQueryParam("X-Plex-Client-Identifier", this.configService.plexClientIdentifier)
      .addQueryParam("X-Plex-Product", this.buildInfo.appName)
      .addQueryParam("X-Plex-Platform", "Windows")
      .addQueryParam("X-Plex-Platform-Version", "7")
      .addQueryParam("X-Plex-Device-Name", this.buildInfo.appName)
      .addQueryParam("X-Plex-Version", this.buildInfo.version);

    if (settings.authToken && settings.authToken.trim() !== "") {
      requestBuilder.addQueryParam("X-Plex-Token", settings.authToken);
    }

    requestBuilder.resource(resource);
    requestBuilder.method = method;

    return requestBuilder;
  }

  private async processRequest(requestBuilder: HttpRequestBuilder): Promise<string> {
    const httpRequest = requestBuilder.build();

    this.logger.debug("Url: %s", httpRequest.url.toString());

    try {
      const response = await this.httpClient.execute(httpRequest);
      return response.content ?? "";
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          throw new PlexAuthenticationException("Unauthorized - AuthToken is invalid");
        }

        throw new PlexException("Unable to connect to Plex Media Server. Status Code: {0}", {
          args: [ex.response.statusCode],
        });
      }

      // Ported from the C#'s `catch (WebException ex)` branch, which special-cases
      // `WebExceptionStatus.TrustFailure` (TLS certificate validation failure) with
      // a distinct message. undici/fetch surfaces TLS failures as a generic
      // TypeError with a `cause` rather than a distinguishable status enum -- see
      // http/HttpException.ts's header comment on why TlsFailureException isn't
      // ported either. Both branches collapse into the generic connection-failure
      // message with the underlying error's message appended, same as the C#'s
      // non-TrustFailure WebException branch.
      const message = ex instanceof Error ? ex.message : String(ex);
      throw new PlexException(`Unable to connect to Plex Media Server, ${message}`, { cause: ex });
    }
  }

  private checkForError(response: string): void {
    this.logger.trace("Checking for error");

    if (!response || response.trim() === "") {
      this.logger.trace("No response body returned, no error detected");
      return;
    }

    const error: PlexError | null = response.includes("_children")
      ? (JSON.parse(response) as PlexError)
      : ((JSON.parse(response) as PlexResponse<PlexError>).mediaContainer ?? null);

    if (error !== null && error.error && error.error.trim() !== "") {
      throw new PlexException(error.error);
    }

    this.logger.trace("No error detected");
  }
}
