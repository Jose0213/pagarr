import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import { HttpUri } from "../../http/HttpUri.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { HttpResponse } from "../../http/HttpResponse.js";
import { XElement } from "../../indexers/xml/XElement.js";
import { SubsonicAuthenticationException, SubsonicException } from "./SubsonicException.js";
import type { SubsonicSettings } from "./SubsonicSettings.js";

/** Minimal logger surface SubsonicServerProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SubsonicServerProxyLogger {
  trace(message: string, ...args: unknown[]): void;
}

/**
 * Ported from NzbDrone.Core/Notifications/Subsonic/SubsonicServerProxy.cs.
 *
 * Uses the real, already-ported `indexers/xml/XElement.ts` DOM adapter for
 * the Subsonic XML REST API responses (rather than a second bespoke XML
 * parser) -- see that file's doc comment for its `fast-xml-parser`-backed
 * shape. C#'s `xDoc.Root.GetDefaultNamespace()` +
 * `Element(XName.Get("error", ns.ToString()))` namespace-qualified lookup
 * collapses to a plain unqualified `element("error")` here: Subsonic's
 * `<subsonic-response xmlns="http://subsonic.org/restapi">` uses a default
 * (unprefixed) namespace, and `XElement.ts`'s tag matching is by literal
 * (unprefixed) tag name -- see that file's doc comment on why prefixed-only
 * namespace matching is an established, documented simplification in this
 * port, and a default namespace never introduces a prefix to begin with, so
 * no behavior is lost here.
 */
export interface ISubsonicServerProxy {
  getBaseUrl(settings: SubsonicSettings, relativePath?: string): string;
  notify(settings: SubsonicSettings, message: string): Promise<void>;
  update(settings: SubsonicSettings): Promise<void>;
  version(settings: SubsonicSettings): Promise<string>;
}

export class SubsonicServerProxy implements ISubsonicServerProxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: SubsonicServerProxyLogger
  ) {}

  getBaseUrl(settings: SubsonicSettings, relativePath?: string): string {
    let baseUrl = HttpRequestBuilder.buildBaseUrl(
      settings.useSsl,
      settings.host,
      settings.port,
      settings.urlBase
    );
    baseUrl = HttpUri.combinePath(baseUrl, relativePath ?? "");

    return baseUrl;
  }

  async notify(settings: SubsonicSettings, message: string): Promise<void> {
    const resource = "addChatMessage";
    const request = this.getSubsonicServerRequest(resource, "GET", settings);
    request.addQueryParam("message", message);

    const response = await this.httpClient.execute(request.build());

    this.logger.trace("Update response: %s", response.content);
    this.checkForError(response, settings);
  }

  async update(settings: SubsonicSettings): Promise<void> {
    const resource = "startScan";
    const request = this.getSubsonicServerRequest(resource, "GET", settings);
    const response = await this.httpClient.execute(request.build());

    this.logger.trace("Update response: %s", response.content);
    this.checkForError(response, settings);
  }

  async version(settings: SubsonicSettings): Promise<string> {
    const request = this.getSubsonicServerRequest("ping", "GET", settings);
    const response = await this.httpClient.execute(request.build());

    this.logger.trace("Version response: %s", response.content);
    this.checkForError(response, settings);

    const xDoc = XElement.parse((response.content ?? "").replaceAll("&", "&amp;"));
    const version = xDoc.attribute("version");

    if (version === null) {
      throw new SubsonicException("Could not read version from Subsonic");
    }

    return version;
  }

  private getSubsonicServerRequest(
    resource: string,
    method: "GET",
    settings: SubsonicSettings
  ): HttpRequestBuilder {
    const client = new HttpRequestBuilder(this.getBaseUrl(settings, "rest"));

    client.resource(resource);

    if (settings.username && settings.username.trim() !== "") {
      client
        .addQueryParam("u", settings.username)
        .addQueryParam("p", settings.password)
        .addQueryParam("c", "Readarr")
        .addQueryParam("v", "1.15.0");
    }

    client.method = method;

    return client;
  }

  private checkForError(response: HttpResponse, _settings: SubsonicSettings): void {
    this.logger.trace("Checking for error");

    const xDoc = XElement.parse((response.content ?? "").replaceAll("&", "&amp;"));
    const status = xDoc.attribute("status");

    if (status === null) {
      throw new SubsonicException("Invalid Response, Check Server Settings");
    }

    if (status === "failed") {
      const error = xDoc.element("error");
      const errorMessage = error?.attribute("message") ?? null;
      const errorCode = error?.attribute("code") ?? null;

      if (errorCode === null) {
        throw new SubsonicException("Subsonic returned error, check settings");
      }

      if (errorCode === "40") {
        throw new SubsonicAuthenticationException(errorMessage ?? "");
      }

      throw new SubsonicException(errorMessage ?? "");
    }

    if (!response.content || response.content.trim() === "") {
      this.logger.trace("No response body returned, no error detected");
      return;
    }

    this.logger.trace("No error detected");
  }
}
