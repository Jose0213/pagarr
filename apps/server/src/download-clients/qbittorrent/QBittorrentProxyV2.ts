import type { IHttpClient } from "../../http/HttpClient.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientException,
  DownloadClientUnavailableException,
} from "../DownloadClientException.js";
import { QBittorrentContentLayout } from "./QBittorrentContentLayout.js";
import type { QBittorrentLabel } from "./QBittorrentLabel.js";
import {
  createQBittorrentPreferences,
  type QBittorrentPreferences,
} from "./QBittorrentPreferences.js";
import { type IQBittorrentProxy, versionGte } from "./QBittorrentProxySelector.js";
import type { QBittorrentProxyLogger } from "./QBittorrentProxyV1.js";
import type { QBittorrentSettings } from "./QBittorrentSettings.js";
import { QBittorrentState } from "./QBittorrentState.js";
import type {
  QBittorrentTorrent,
  QBittorrentTorrentFile,
  QBittorrentTorrentProperties,
} from "./QBittorrentTorrent.js";
import type { TorrentSeedConfiguration } from "../TorrentSeedConfiguration.js";

const noopLogger: QBittorrentProxyLogger = { debug: () => {} };

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentProxyV2.cs.
 * qBittorrent WebUI API v2 (4.1+).
 *
 * Same auth-cookie-cache deviation as QBittorrentProxyV1.ts's doc comment.
 */
export class QBittorrentProxyV2 implements IQBittorrentProxy {
  private readonly authCookieCache = new Map<string, Map<string, string>>();

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: QBittorrentProxyLogger = noopLogger
  ) {}

  async isApiSupported(settings: QBittorrentSettings): Promise<boolean> {
    // We can do the api test without having to authenticate since
    // v3.2.0-v4.0.4 will return 404 on the request.
    const request = this.buildRequest(settings).resource("/api/v2/app/webapiVersion");
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

      if (response.statusCode === 401) {
        throw new DownloadClientException(
          "Failed to connect to qBittorrent. Check your settings and qBittorrent configuration.",
          { cause: new HttpException(request.build(), response) }
        );
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
    const request = this.buildRequest(settings).resource("/api/v2/app/webapiVersion");
    return this.processRequest(request, settings);
  }

  async getVersion(settings: QBittorrentSettings): Promise<string> {
    const request = this.buildRequest(settings).resource("/api/v2/app/version");
    const response = await this.processRequest(request, settings);
    // eg "4.2alpha"
    return response.replace(/^v/, "");
  }

  async getConfig(settings: QBittorrentSettings): Promise<QBittorrentPreferences> {
    const request = this.buildRequest(settings).resource("/api/v2/app/preferences");
    const response = await this.processRequestJson<QBittorrentPreferences>(request, settings);
    return createQBittorrentPreferences(response);
  }

  async getTorrents(settings: QBittorrentSettings): Promise<QBittorrentTorrent[]> {
    const request = this.buildRequest(settings).resource("/api/v2/torrents/info");

    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addQueryParam("category", settings.musicCategory);
    }

    return this.processRequestJson<QBittorrentTorrent[]>(request, settings);
  }

  async isTorrentLoaded(hash: string, settings: QBittorrentSettings): Promise<boolean> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/properties")
      .addQueryParam("hash", hash);
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
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/properties")
      .addQueryParam("hash", hash);
    return this.processRequestJson<QBittorrentTorrentProperties>(request, settings);
  }

  async getTorrentFiles(
    hash: string,
    settings: QBittorrentSettings
  ): Promise<QBittorrentTorrentFile[]> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/files")
      .addQueryParam("hash", hash);
    return this.processRequestJson<QBittorrentTorrentFile[]>(request, settings);
  }

  async addTorrentFromUrl(
    torrentUrl: string,
    seedConfiguration: TorrentSeedConfiguration | null,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/add")
      .post()
      .addFormParameter("urls", torrentUrl);

    await this.addTorrentDownloadFormParameters(request, settings);

    if (seedConfiguration != null) {
      this.addTorrentSeedingFormParameters(request, seedConfiguration);
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
    seedConfiguration: TorrentSeedConfiguration | null,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/add")
      .post()
      .addFormUpload("torrents", fileName, fileContent);

    await this.addTorrentDownloadFormParameters(request, settings);

    if (seedConfiguration != null) {
      this.addTorrentSeedingFormParameters(request, seedConfiguration);
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
      .resource("/api/v2/torrents/delete")
      .post()
      .addFormParameter("hashes", hash);

    if (removeData) {
      request.addFormParameter("deleteFiles", "true");
    }

    await this.processRequest(request, settings);
  }

  async setTorrentLabel(hash: string, label: string, settings: QBittorrentSettings): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/setCategory")
      .post()
      .addFormParameter("hashes", hash)
      .addFormParameter("category", label);
    await this.processRequest(request, settings);
  }

  async addLabel(label: string, settings: QBittorrentSettings): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/createCategory")
      .post()
      .addFormParameter("category", label);
    await this.processRequest(request, settings);
  }

  async getLabels(settings: QBittorrentSettings): Promise<Record<string, QBittorrentLabel>> {
    const request = this.buildRequest(settings).resource("/api/v2/torrents/categories");
    return JSON.parse(await this.processRequest(request, settings)) as Record<
      string,
      QBittorrentLabel
    >;
  }

  private addTorrentSeedingFormParameters(
    request: HttpRequestBuilder,
    seedConfiguration: TorrentSeedConfiguration,
    always = false
  ): void {
    const ratioLimit = seedConfiguration.ratio ?? -2;
    const seedingTimeLimit =
      seedConfiguration.seedTime != null ? Math.trunc(seedConfiguration.seedTime / 60000) : -2;

    if (ratioLimit !== -2 || always) {
      request.addFormParameter("ratioLimit", ratioLimit);
    }

    if (seedingTimeLimit !== -2 || always) {
      request.addFormParameter("seedingTimeLimit", seedingTimeLimit);
    }
  }

  private async addTorrentDownloadFormParameters(
    request: HttpRequestBuilder,
    settings: QBittorrentSettings
  ): Promise<void> {
    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addFormParameter("category", settings.musicCategory);
    }

    // Avoid extraneous API version check if initial state is ForceStart.
    if (
      settings.initialState === QBittorrentState.Start ||
      settings.initialState === QBittorrentState.Stop
    ) {
      const apiVersion = await this.getApiVersion(settings);
      const stoppedParameterName = versionGte(apiVersion, "2.11.0") ? "stopped" : "paused";

      // Note: ForceStart is handled by separate api call.
      if (settings.initialState === QBittorrentState.Start) {
        request.addFormParameter(stoppedParameterName, false);
      } else if (settings.initialState === QBittorrentState.Stop) {
        request.addFormParameter(stoppedParameterName, true);
      }
    }

    if (settings.sequentialOrder) {
      request.addFormParameter("sequentialDownload", true);
    }

    if (settings.firstAndLast) {
      request.addFormParameter("firstLastPiecePrio", true);
    }

    if (settings.contentLayout === QBittorrentContentLayout.Original) {
      request.addFormParameter("contentLayout", "Original");
    } else if (settings.contentLayout === QBittorrentContentLayout.Subfolder) {
      request.addFormParameter("contentLayout", "Subfolder");
    }
  }

  async setTorrentSeedingConfiguration(
    hash: string,
    seedConfiguration: TorrentSeedConfiguration,
    settings: QBittorrentSettings
  ): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/setShareLimits")
      .post()
      .addFormParameter("hashes", hash);

    this.addTorrentSeedingFormParameters(request, seedConfiguration, true);

    try {
      await this.processRequest(request, settings);
    } catch (ex) {
      // setShareLimits was added in api v2.0.1 so catch it case of the
      // unlikely event that someone has api v2.0.
      if (
        ex instanceof DownloadClientException &&
        ex.cause instanceof HttpException &&
        ex.cause.response.statusCode === 404
      ) {
        return;
      }

      throw ex;
    }
  }

  async moveTorrentToTopInQueue(hash: string, settings: QBittorrentSettings): Promise<void> {
    const request = this.buildRequest(settings)
      .resource("/api/v2/torrents/topPrio")
      .post()
      .addFormParameter("hashes", hash);

    try {
      await this.processRequest(request, settings);
    } catch (ex) {
      // qBittorrent rejects all Prio commands with 409: Conflict if
      // Options -> BitTorrent -> Torrent Queueing is not enabled.
      if (
        ex instanceof DownloadClientException &&
        ex.cause instanceof HttpException &&
        ex.cause.response.statusCode === 409
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
      .resource("/api/v2/torrents/setForceStart")
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
      if (reauthenticate) {
        throw new DownloadClientAuthenticationException("Failed to authenticate with qBittorrent.");
      }

      return;
    }

    const authKey = `${requestBuilder.baseUrl.toString()}:${settings.password}`;

    let cookies = this.authCookieCache.get(authKey);

    if (!cookies || reauthenticate) {
      this.authCookieCache.delete(authKey);

      const authLoginRequest = this.buildRequest(settings)
        .resource("/api/v2/auth/login")
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

        if (ex instanceof HttpException) {
          throw new DownloadClientException(
            "Failed to connect to qBittorrent, please check your settings.",
            { cause: ex }
          );
        }

        throw new DownloadClientUnavailableException(
          "Failed to connect to qBittorrent, please check your settings.",
          { cause: ex }
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
