import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import { HttpUri } from "../../http/HttpUri.js";
import {
  DownloadClientException,
  DownloadClientUnavailableException,
} from "../DownloadClientException.js";
import type { SabnzbdAddResponse } from "./Responses/SabnzbdAddResponse.js";
import { createSabnzbdAddResponse } from "./Responses/SabnzbdAddResponse.js";
import type { SabnzbdConfigResponse } from "./Responses/SabnzbdConfigResponse.js";
import type { SabnzbdFullStatusResponse } from "./Responses/SabnzbdFullStatusResponse.js";
import {
  createSabnzbdRetryResponse,
  type SabnzbdRetryResponse,
} from "./Responses/SabnzbdRetryResponse.js";
import { createSabnzbdVersionResponse } from "./Responses/SabnzbdVersionResponse.js";
import type { SabnzbdConfig } from "./SabnzbdCategory.js";
import type { SabnzbdFullStatus } from "./SabnzbdFullStatus.js";
import type { SabnzbdHistory } from "./SabnzbdHistory.js";
import {
  createSabnzbdJsonError,
  sabnzbdJsonErrorFailed,
  type SabnzbdJsonError,
} from "./SabnzbdJsonError.js";
import type { SabnzbdQueue } from "./SabnzbdQueue.js";
import type { SabnzbdSettings } from "./SabnzbdSettings.js";

/** Minimal logger surface SabnzbdProxy needs. */
export interface SabnzbdProxyLogger {
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: SabnzbdProxyLogger = { debug: () => {} };

export interface ISabnzbdProxy {
  getBaseUrl(settings: SabnzbdSettings, relativePath?: string): string;
  downloadNzb(
    nzbData: Uint8Array,
    filename: string,
    category: string,
    priority: number,
    settings: SabnzbdSettings
  ): Promise<SabnzbdAddResponse>;
  removeFromQueue(id: string, deleteData: boolean, settings: SabnzbdSettings): Promise<void>;
  removeFromHistory(
    id: string,
    deleteData: boolean,
    deletePermanently: boolean,
    settings: SabnzbdSettings
  ): Promise<void>;
  getVersion(settings: SabnzbdSettings): Promise<string>;
  getConfig(settings: SabnzbdSettings): Promise<SabnzbdConfig>;
  getFullStatus(settings: SabnzbdSettings): Promise<SabnzbdFullStatus>;
  getQueue(start: number, limit: number, settings: SabnzbdSettings): Promise<SabnzbdQueue>;
  getHistory(start: number, limit: number, settings: SabnzbdSettings): Promise<SabnzbdHistory>;
  retryDownload(id: string, settings: SabnzbdSettings): Promise<string>;
}

/** Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdProxy.cs. */
export class SabnzbdProxy implements ISabnzbdProxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: SabnzbdProxyLogger = noopLogger
  ) {}

  getBaseUrl(settings: SabnzbdSettings, relativePath?: string): string {
    const baseUrl = HttpRequestBuilder.buildBaseUrl(
      settings.useSsl,
      settings.host,
      settings.port,
      settings.urlBase
    );
    return HttpUri.combinePath(baseUrl, relativePath ?? "");
  }

  async downloadNzb(
    nzbData: Uint8Array,
    filename: string,
    _category: string,
    priority: number,
    settings: SabnzbdSettings
  ): Promise<SabnzbdAddResponse> {
    const request = this.buildRequest("addfile", settings).post();

    request.addQueryParam("cat", settings.musicCategory);
    request.addQueryParam("priority", priority);

    request.addFormUpload("name", filename, nzbData, "application/x-nzb");

    const content = await this.processRequest(request, settings);

    try {
      return JSON.parse(content) as SabnzbdAddResponse;
    } catch {
      return createSabnzbdAddResponse({ status: true });
    }
  }

  async removeFromQueue(id: string, deleteData: boolean, settings: SabnzbdSettings): Promise<void> {
    const request = this.buildRequest("queue", settings);
    request.addQueryParam("name", "delete");
    request.addQueryParam("del_files", deleteData ? 1 : 0);
    request.addQueryParam("value", id);

    await this.processRequest(request, settings);
  }

  async removeFromHistory(
    id: string,
    deleteData: boolean,
    deletePermanently: boolean,
    settings: SabnzbdSettings
  ): Promise<void> {
    const request = this.buildRequest("history", settings);
    request.addQueryParam("name", "delete");
    request.addQueryParam("del_files", deleteData ? 1 : 0);
    request.addQueryParam("value", id);
    request.addQueryParam("archive", deletePermanently ? 0 : 1);

    await this.processRequest(request, settings);
  }

  async getVersion(settings: SabnzbdSettings): Promise<string> {
    const request = this.buildRequest("version", settings);
    const content = await this.processRequest(request, settings);

    try {
      return (JSON.parse(content) as { version: string }).version;
    } catch {
      return createSabnzbdVersionResponse().version;
    }
  }

  async getConfig(settings: SabnzbdSettings): Promise<SabnzbdConfig> {
    const request = this.buildRequest("get_config", settings);
    const content = await this.processRequest(request, settings);
    const response = JSON.parse(content) as SabnzbdConfigResponse;
    return response.config;
  }

  async getFullStatus(settings: SabnzbdSettings): Promise<SabnzbdFullStatus> {
    const request = this.buildRequest("fullstatus", settings);
    request.addQueryParam("skip_dashboard", "1");

    const content = await this.processRequest(request, settings);
    const response = JSON.parse(content) as SabnzbdFullStatusResponse;
    return response.status;
  }

  async getQueue(start: number, limit: number, settings: SabnzbdSettings): Promise<SabnzbdQueue> {
    const request = this.buildRequest("queue", settings);
    request.addQueryParam("start", start);
    request.addQueryParam("limit", limit);

    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addQueryParam("category", settings.musicCategory);
    }

    const content = await this.processRequest(request, settings);
    const parsed = JSON.parse(content) as { queue: SabnzbdQueue };
    return parsed.queue;
  }

  async getHistory(
    start: number,
    limit: number,
    settings: SabnzbdSettings
  ): Promise<SabnzbdHistory> {
    const request = this.buildRequest("history", settings);
    request.addQueryParam("start", start);
    request.addQueryParam("limit", limit);

    if (settings.musicCategory && settings.musicCategory.trim() !== "") {
      request.addQueryParam("category", settings.musicCategory);
    }

    const content = await this.processRequest(request, settings);
    const parsed = JSON.parse(content) as { history: SabnzbdHistory };
    return parsed.history;
  }

  async retryDownload(id: string, settings: SabnzbdSettings): Promise<string> {
    const request = this.buildRequest("retry", settings);
    request.addQueryParam("value", id);

    const content = await this.processRequest(request, settings);

    let response: SabnzbdRetryResponse;
    try {
      response = JSON.parse(content) as SabnzbdRetryResponse;
    } catch {
      response = createSabnzbdRetryResponse({ status: true });
    }

    return response.nzo_id;
  }

  private buildRequest(mode: string, settings: SabnzbdSettings): HttpRequestBuilder {
    const baseUrl = this.getBaseUrl(settings, "api");

    const requestBuilder = new HttpRequestBuilder(baseUrl)
      .accept(HttpAccept.Json)
      .addQueryParam("mode", mode);

    requestBuilder.logResponseContent = true;

    if (settings.apiKey && settings.apiKey.trim() !== "") {
      requestBuilder.addSuffixQueryParam("apikey", settings.apiKey);
    } else {
      requestBuilder.addSuffixQueryParam("ma_username", settings.username);
      requestBuilder.addSuffixQueryParam("ma_password", settings.password);
    }

    requestBuilder.addSuffixQueryParam("output", "json");

    return requestBuilder;
  }

  private async processRequest(
    requestBuilder: HttpRequestBuilder,
    _settings: SabnzbdSettings
  ): Promise<string> {
    const httpRequest = requestBuilder.build();

    this.logger.debug("Url: %s", httpRequest.url.toString());

    let response;
    try {
      response = await this.httpClient.execute(httpRequest);
    } catch (ex) {
      if (ex instanceof HttpException) {
        throw new DownloadClientException("Unable to connect to SABnzbd, {0}", {
          cause: ex,
          args: [ex.message],
        });
      }

      throw new DownloadClientUnavailableException("Unable to connect to SABnzbd, {0}", {
        cause: ex,
        args: [errorMessage(ex)],
      });
    }

    this.checkForError(response.content);

    return response.content;
  }

  private checkForError(content: string): void {
    let result: SabnzbdJsonError;

    try {
      result = JSON.parse(content) as SabnzbdJsonError;
      if (typeof result.status !== "string") {
        throw new Error("not a SabnzbdJsonError shape");
      }
    } catch {
      // Handle plain text responses from SAB.
      result = createSabnzbdJsonError();

      if (content.toLowerCase().startsWith("error")) {
        result.status = "false";
        result.error = content.replace(/^error: /i, "");
      } else {
        result.status = "true";
      }

      result.error = content.replace(/^error: /i, "");
    }

    if (sabnzbdJsonErrorFailed(result)) {
      throw new DownloadClientException("Error response received from SABnzbd: {0}", {
        args: [result.error],
      });
    }
  }
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}
