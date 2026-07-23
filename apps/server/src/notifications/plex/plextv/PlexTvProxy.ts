import { HttpAccept } from "../../../http/HttpAccept.js";
import { HttpException } from "../../../http/HttpException.js";
import { HttpRequestBuilder } from "../../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import type { BuildInfo } from "../../../http/UserAgentBuilder.js";
import { NzbDroneClientException } from "../../../exceptions/NzbDroneClientException.js";
import { newPlexTvPinResponse, type PlexTvPinResponse } from "./PlexTvResponses.js";

/** Minimal logger surface PlexTvProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface PlexTvProxyLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Ported from NzbDrone.Core/Notifications/Plex/PlexTv/PlexTvProxy.cs.
 *
 * `NzbDroneClientException` (thrown from `ProcessRequest` on
 * `HttpException`/`WebException`) is the real, already-ported
 * `exceptions/NzbDroneClientException.ts` -- imported directly, not
 * forward-refed (Exceptions is a real merged sibling module per this task's
 * brief).
 */
export interface IPlexTvProxy {
  getAuthToken(clientIdentifier: string, pinId: number): Promise<string | null>;
  ping(clientIdentifier: string, authToken: string): Promise<boolean>;
}

export class PlexTvProxy implements IPlexTvProxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly buildInfo: BuildInfo,
    private readonly logger: PlexTvProxyLogger
  ) {}

  async getAuthToken(clientIdentifier: string, pinId: number): Promise<string | null> {
    const request = this.buildRequest(clientIdentifier);
    request.resource(`/api/v2/pins/${pinId}`);

    const content = await this.processRequest(request);

    let response: PlexTvPinResponse;
    try {
      response = JSON.parse(content) as PlexTvPinResponse;
    } catch {
      response = newPlexTvPinResponse();
    }

    return response.authToken;
  }

  async ping(clientIdentifier: string, authToken: string): Promise<boolean> {
    try {
      // Allows us to tell plex.tv that we're still active and tokens should not be expired.
      const request = this.buildRequest(clientIdentifier);

      request.resource("/api/v2/ping");
      request.addQueryParam("X-Plex-Token", authToken);

      await this.processRequest(request);

      return true;
    } catch (e) {
      // Catch all exceptions and log at trace, this information could be interesting in debugging, but expired tokens will be handled elsewhere.
      this.logger.trace("Unable to ping plex.tv", e);
    }

    return false;
  }

  private buildRequest(clientIdentifier: string): HttpRequestBuilder {
    return new HttpRequestBuilder("https://plex.tv")
      .accept(HttpAccept.Json)
      .addQueryParam("X-Plex-Client-Identifier", clientIdentifier)
      .addQueryParam("X-Plex-Product", this.buildInfo.appName)
      .addQueryParam("X-Plex-Platform", "Windows")
      .addQueryParam("X-Plex-Platform-Version", "7")
      .addQueryParam("X-Plex-Device-Name", this.buildInfo.appName)
      .addQueryParam("X-Plex-Version", this.buildInfo.version);
  }

  private async processRequest(requestBuilder: HttpRequestBuilder): Promise<string> {
    const httpRequest = requestBuilder.build();

    this.logger.debug("Url: %s", httpRequest.url.toString());

    let response;
    try {
      response = await this.httpClient.execute(httpRequest);
    } catch (ex) {
      // Ported from the two catch clauses in PlexTvProxy.ProcessRequest that
      // both throw NzbDroneClientException(statusCode, "Unable to connect to
      // plex.tv") -- one for HttpException (uses the response status code),
      // one for WebException (hardcodes HttpStatusCode.BadRequest, 400).
      // undici/fetch has no distinct "transport-level WebException vs
      // HTTP-level HttpException" split the way .NET's HttpClient does (both
      // surface as thrown errors here), so the status code is taken from the
      // HttpException's response when available, else falls back to 400
      // matching the WebException branch's hardcoded BadRequest.
      const statusCode = ex instanceof HttpException ? ex.response.statusCode : 400;
      throw new NzbDroneClientException(statusCode, "Unable to connect to plex.tv", { cause: ex });
    }

    return response.content ?? "";
  }
}
