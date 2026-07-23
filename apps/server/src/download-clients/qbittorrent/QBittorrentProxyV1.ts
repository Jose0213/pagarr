import type { IHttpClient } from "../../http/HttpClient.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientException,
} from "../DownloadClientException.js";
import type { IQBittorrentProxy } from "./QBittorrentProxySelector.js";
import { QBittorrentState } from "./QBittorrentState.js";
import type { QBittorrentLabel } from "./QBittorrentLabel.js";
import {
  createQBittorrentPreferences,
  type QBittorrentPreferences,
} from "./QBittorrentPreferences.js";
import type { QBittorrentSettings } from "./QBittorrentSettings.js";
import type {
  QBittorrentTorrent,
  QBittorrentTorrentFile,
  QBittorrentTorrentProperties,
} from "./QBittorrentTorrent.js";
import type { TorrentSeedConfiguration } from "../TorrentSeedConfiguration.js";

/** Minimal logger surface the qBittorrent proxies need. */
export interface QBittorrentProxyLogger {
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: QBittorrentProxyLogger = { debug: () => {} };

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentProxyV1.cs.
 * qBittorrent WebUI API v1 (legacy, pre-4.1).
 *
 * DEVIATION -- auth-cookie cache: C#'s `ICacheManager.GetCache<Dictionary<string,
 * string>>(GetType(), "authCookies")` (from the not-yet-ported Common.Cache
 * module) has no TTL of its own (cookies persist until `reauthenticate` or
 * process restart) -- ported here as a plain instance-level `Map`, matching
 * `QBittorrentProxySelector.ts`'s "genuinely load-bearing, not a perf nicety"
 * rationale for keeping caching (skipping login on every single request), but
 * without a TTL since the C# original has none either.
 */
export class QBittorrentProxyV1 implements IQBittorrentProxy {
  private readonly authCookieCache = new Map<string, Map<string, string>>();

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: QBittorrentProxyLogger = noopLogger
  ) {}

  async isApiSupported(settings: QBittorrentSettings): Promise<boolean> {
    // We can do the api test without having to authenticate since v4.1 will
    // return 404 on the request.
    const request = this.buildRequest(settings).resource("/version/api");
    request.suppressHttpError = true;

    try {
      const response = await this.httpClient.execute(request.build());

      // Version request will return 404 if it doesn't exist.
      if (response.statusCode === 404) {
        return false;
      }

      if (response.statusCode === 403) {
        return true;
      }

      if (response.hasHttpError) {
        throw new DownloadClientException(
          "Failed to connect to qBittorrent, check your settings.",
          {
            cause: new HttpException(request.build(), response),
          }
        );
      }

      return true;
    } catch (ex) {
      if (ex instanceof DownloadClientException) {
        throw ex;
      }
      throw new DownloadClientException("Failed to connect to qBittorrent, check your settings.", {
        cause: ex,
      });
    }
  }

  async getApiVersion(settings: QBittorrentSettings): Promise<string> {
    // Version request does not require authentication and will return 404
    // if it doesn't exist.
    const request = this.buildRequest(settings).resource("/version/api");
    const response = await this.processRequest(request, settings);
    return "1." + response;
  }

  async getVersion(settings: QBittorrentSettings): Promise<string> {
    // Version request does not require authentication.
    const request = this.buildRequest(settings).resource("/version/qbittorrent");
    const response = await this.processRequest(request, settings);
    return response.replace(/^v/, "");
  }

  async getConfig(settings: QBittorrentSettings): Promise<QBittorrentPreferences> {
    const request = this.buildRequest(settings).resource("/query/preferences");
    const response = await this.processRequestJson<QBittorrentPreferences>(request, settings);
    return createQBittorrentPreferences(response);
  }

  async getTorrents(settings: QBittorrentSettings): Promise<QBittorrentTorrent[]> {
    const request = this.buildRequest(settings).resource("/query/torrents");

    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addQueryParam("label", settings.musicCategory);
      request.addQueryParam("category", settings.musicCategory);
    }

    return this.processRequestJson<QBittorrentTorrent[]>(request, settings);
  }

  async isTorrentLoaded(hash: string, settings: QBittorrentSettings): Promise<boolean> {
    const request = this.buildRequest(settings).resource(`/query/propertiesGeneral/${hash}`);
    request.logHttpError = false;

    try {
      await this.processRequest(request, settings);
      return true;
    } catch {
      return false;
    }
  }

  async getTorrentProperties(
    hash: string,
    settings: QBittorrentSettings
  ): Promise<QBittorrentTorrentProperties> {
    const request = this.buildRequest(settings).resource(`/query/propertiesGeneral/${hash}`);
    return this.processRequestJson<QBittorrentTorrentProperties>(request, settings);
  }

  async getTorrentFiles(
    hash: string,
    settings: QBittorrentSettings
  ): Promise<QBittorrentTorrentFile[]> {
    const request = this.buildRequest(settings).resource(`/query/propertiesFiles/${hash}`);
    return this.processRequestJson<QBittorrentTorrentFile[]>(request, settings);
  }

  async addTorrentFromUrl(
    torrentUrl: string,
    _seedConfiguration: TorrentSeedConfiguration | null,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/command/download")
      .post()
      .addFormParameter("urls", torrentUrl);

    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addFormParameter("category", settings.musicCategory);
    }

    // Note: ForceStart is handled by separate api call.
    if (settings.initialState === QBittorrentState.Start) {
      request.addFormParameter("paused", false);
    } else if (settings.initialState === QBittorrentState.Stop) {
      request.addFormParameter("paused", true);
    }

    const result = await this.processRequest(request, settings);

    // Note: Older qbit versions returned nothing, so we can't do != "Ok." here.
    if (result === "Fails.") {
      throw new DownloadClientException("Download client failed to add torrent by url");
    }
  }

  async addTorrentFromFile(
    fileName: string,
    fileContent: Uint8Array,
    _seedConfiguration: TorrentSeedConfiguration | null,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/command/upload")
      .post()
      .addFormUpload("torrents", fileName, fileContent);

    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addFormParameter("category", settings.musicCategory);
    }

    if (settings.initialState === QBittorrentState.Start) {
      request.addFormParameter("paused", false);
    } else if (settings.initialState === QBittorrentState.Stop) {
      request.addFormParameter("paused", true);
    }

    const result = await this.processRequest(request, settings);

    if (result === "Fails.") {
      throw new DownloadClientException("Download client failed to add torrent");
    }
  }

  async removeTorrent(
    hash: string,
    removeData: boolean,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource(removeData ? "/command/deletePerm" : "/command/delete")
      .post()
      .addFormParameter("hashes", hash);

    await this.processRequest(request, settings);
  }

  async setTorrentLabel(hash: string, label: string, settings: QBittorrentSettings): Promise<void> {
    const setCategoryRequest = this.buildRequest(settings)
      .resource("/command/setCategory")
      .post()
      .addFormParameter("hashes", hash)
      .addFormParameter("category", label);

    try {
      await this.processRequest(setCategoryRequest, settings);
    } catch (ex) {
      // If setCategory fails due to method not being found, then try older
      // setLabel command for qBittorrent < v.3.3.5.
      if (
        ex instanceof DownloadClientException &&
        ex.cause instanceof HttpException &&
        ex.cause.response.statusCode === 404
      ) {
        const setLabelRequest = this.buildRequest(settings)
          .resource("/command/setLabel")
          .post()
          .addFormParameter("hashes", hash)
          .addFormParameter("label", label);

        await this.processRequest(setLabelRequest, settings);
        return;
      }

      throw ex;
    }
  }

  async addLabel(label: string, settings: QBittorrentSettings): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/command/addCategory")
      .post()
      .addFormParameter("category", label);
    await this.processRequest(request, settings);
  }

  getLabels(_settings: QBittorrentSettings): Promise<Record<string, QBittorrentLabel>> {
    throw new Error("qBittorrent api v1 does not support getting all torrent categories");
  }

  async setTorrentSeedingConfiguration(
    _hash: string,
    _seedConfiguration: TorrentSeedConfiguration,
    _settings: QBittorrentSettings
  ): Promise<void> {
    // Not supported on api v1.
  }

  async moveTorrentToTopInQueue(hash: string, settings: QBittorrentSettings): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/command/topPrio")
      .post()
      .addFormParameter("hashes", hash);

    try {
      await this.processRequest(request, settings);
    } catch (ex) {
      // qBittorrent rejects all Prio commands with 403: Forbidden if
      // Options -> BitTorrent -> Torrent Queueing is not enabled.
      if (
        ex instanceof DownloadClientException &&
        ex.cause instanceof HttpException &&
        ex.cause.response.statusCode === 403
      ) {
        return;
      }

      throw ex;
    }
  }

  async setForceStart(
    hash: string,
    enabled: boolean,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/command/setForceStart")
      .post()
      .addFormParameter("hashes", hash)
      .addFormParameter("value", enabled ? "true" : "false");
    await this.processRequest(request, settings);
  }

  private buildRequest(settings: QBittorrentSettings): HttpRequestBuilder {
    const requestBuilder = new HttpRequestBuilder(
      settings.useSsl,
      settings.host,
      settings.port,
      settings.urlBase
    );
    requestBuilder.logResponseContent = true;
    requestBuilder.networkCredential = basicNetworkCredential(settings.username, settings.password);
    return requestBuilder;
  }

  private async processRequestJson<TResult>(
    requestBuilder: HttpRequestBuilder,
    settings: QBittorrentSettings
  ): Promise<TResult> {
    const responseContent = await this.processRequest(requestBuilder, settings);
    return JSON.parse(responseContent) as TResult;
  }

  private async processRequest(
    requestBuilder: HttpRequestBuilder,
    settings: QBittorrentSettings
  ): Promise<string> {
    await this.authenticateClient(requestBuilder, settings);

    let request = requestBuilder.build();
    request.logResponseContent = true;
    request.suppressHttpErrorStatusCodes = [403];

    let response;
    try {
      response = await this.httpClient.execute(request);

      if (response.statusCode === 403) {
        this.logger.debug("Authentication required, logging in.");

        await this.authenticateClient(requestBuilder, settings, true);

        request = requestBuilder.build();
        response = await this.httpClient.execute(request);
      }
    } catch (ex) {
      if (ex instanceof HttpException) {
        throw new DownloadClientException(
          "Failed to connect to qBittorrent, check your settings.",
          {
            cause: ex,
          }
        );
      }

      throw new DownloadClientException(
        "Failed to connect to qBittorrent, please check your settings.",
        { cause: ex }
      );
    }

    return response.content;
  }

  private async authenticateClient(
    requestBuilder: HttpRequestBuilder,
    settings: QBittorrentSettings,
    reauthenticate = false
  ): Promise<void> {
    if (
      !settings.username ||
      settings.username.trim() === "" ||
      !settings.password ||
      settings.password.trim() === ""
    ) {
      return;
    }

    const authKey = `${requestBuilder.baseUrl.toString()}:${settings.password}`;

    let cookies = this.authCookieCache.get(authKey);

    if (!cookies || reauthenticate) {
      this.authCookieCache.delete(authKey);

      const authLoginRequest = this.buildRequest(settings)
        .resource("/login")
        .post()
        .addFormParameter("username", settings.username ?? "")
        .addFormParameter("password", settings.password ?? "")
        .build();

      let response;
      try {
        response = await this.httpClient.execute(authLoginRequest);
      } catch (ex) {
        this.logger.debug("qbitTorrent authentication failed.");
        if (ex instanceof HttpException && ex.response.statusCode === 403) {
          throw new DownloadClientAuthenticationException(
            "Failed to authenticate with qBittorrent.",
            {
              cause: ex,
            }
          );
        }

        throw new DownloadClientException(
          "Failed to connect to qBittorrent, please check your settings.",
          {
            cause: ex,
          }
        );
      }

      // returns "Fails." on bad login
      if (response.content !== "Ok.") {
        this.logger.debug("qbitTorrent authentication failed.");
        throw new DownloadClientAuthenticationException("Failed to authenticate with qBittorrent.");
      }

      this.logger.debug("qBittorrent authentication succeeded.");

      cookies = response.getCookies();

      this.authCookieCache.set(authKey, cookies);
    }

    requestBuilder.setCookies(cookies);
  }
}
