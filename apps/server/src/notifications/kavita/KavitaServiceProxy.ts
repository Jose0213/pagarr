import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import { HttpUri } from "../../http/HttpUri.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { BuildInfo } from "../../http/UserAgentBuilder.js";
import { KavitaException } from "./KavitaException.js";
import type { KavitaAuthenticationResult } from "./KavitaAuthenticationResult.js";
import type { KavitaSettings } from "./KavitaSettings.js";

/** Minimal logger surface KavitaServiceProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface KavitaServiceProxyLogger {
  trace(message: string, ...args: unknown[]): void;
}

/** Ported from NzbDrone.Core/Notifications/Kavita/KavitaServiceProxy.cs. */
export interface IKavitaServiceProxy {
  getBaseUrl(settings: KavitaSettings, relativePath?: string): string;
  notify(settings: KavitaSettings, folderPath: string): Promise<void>;
  getToken(settings: KavitaSettings): Promise<string | null>;
}

export class KavitaServiceProxy implements IKavitaServiceProxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly buildInfo: BuildInfo,
    private readonly logger: KavitaServiceProxyLogger
  ) {}

  getBaseUrl(settings: KavitaSettings, relativePath?: string): string {
    let baseUrl = HttpRequestBuilder.buildBaseUrl(
      settings.useSsl,
      settings.host,
      settings.port,
      ""
    );
    baseUrl = HttpUri.combinePath(baseUrl, relativePath ?? "");

    return baseUrl;
  }

  async notify(settings: KavitaSettings, folderPath: string): Promise<void> {
    const request = this.getKavitaServerRequest("library/scan-folder", "POST", settings);
    request.headers.contentType = "application/json";
    const postRequest = request.build();
    postRequest.setContent(
      JSON.stringify({
        ApiKey: settings.apiKey,
        // Ported from `folderPath.Replace("/", "//")` -- an apparent Kavita
        // API quirk/workaround (doubling forward slashes), preserved
        // faithfully even though it looks unusual.
        FolderPath: folderPath.replaceAll("/", "//"),
      })
    );

    const response = await this.httpClient.post(postRequest);
    this.logger.trace(
      "Update response: %s",
      !response.content || response.content === "" ? "Success" : response.content
    );
  }

  async getToken(settings: KavitaSettings): Promise<string | null> {
    const request = this.getKavitaServerRequest("plugin/authenticate", "POST", settings);
    request
      .addQueryParam("apiKey", settings.apiKey)
      .addQueryParam("pluginName", this.buildInfo.appName);
    const response = await this.httpClient.execute(request.build());

    this.logger.trace("Authenticate response: %s", response.content);

    let authResult: KavitaAuthenticationResult | null;
    try {
      authResult = JSON.parse(response.content ?? "") as KavitaAuthenticationResult;
    } catch {
      authResult = null;
    }

    if (authResult === null) {
      throw new KavitaException("Could not authenticate with Kavita");
    }

    return authResult.token;
  }

  private getKavitaServerRequest(
    resource: string,
    method: "GET" | "POST",
    settings: KavitaSettings
  ): HttpRequestBuilder {
    const client = new HttpRequestBuilder(this.getBaseUrl(settings, "api"));

    client.resource(resource);

    if (settings.apiKey && settings.apiKey.trim() !== "") {
      client.headers.set("x-kavita-apikey", settings.apiKey);
      client.headers.set("x-kavita-plugin", this.buildInfo.appName);
    }

    client.method = method;

    return client;
  }
}
