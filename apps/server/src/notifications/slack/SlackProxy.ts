import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { SlackExeption } from "./SlackException.js";
import type { SlackSettings } from "./SlackSettings.js";
import type { SlackPayload } from "./payloads.js";

/** Minimal logger surface SlackProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SlackProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

export const noopSlackProxyLogger: SlackProxyLogger = {
  error: () => {},
};

/** Ported from NzbDrone.Core/Notifications/Slack/SlackProxy.cs. */
export interface ISlackProxy {
  sendPayload(payload: SlackPayload, settings: SlackSettings): Promise<void>;
}

export class SlackProxy implements ISlackProxy {
  private readonly httpClient: IHttpClient;
  private readonly logger: SlackProxyLogger;

  constructor(httpClient: IHttpClient, logger: SlackProxyLogger = noopSlackProxyLogger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  async sendPayload(payload: SlackPayload, settings: SlackSettings): Promise<void> {
    try {
      const requestBuilder = new HttpRequestBuilder(settings.webHookUrl).accept(HttpAccept.Json);

      const request = requestBuilder.build();

      request.method = "POST";
      request.headers.contentType = "application/json";
      request.setContent(JSON.stringify(payload));

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        this.logger.error("Unable to post payload %s", payload, ex);
        throw new SlackExeption("Unable to post payload", { cause: ex });
      }

      throw ex;
    }
  }
}
