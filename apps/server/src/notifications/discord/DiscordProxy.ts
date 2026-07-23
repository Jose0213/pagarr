import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { DiscordException } from "./DiscordException.js";
import type { DiscordSettings } from "./DiscordSettings.js";
import type { DiscordPayload } from "./payloads.js";

/** Minimal logger surface DiscordProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface DiscordProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

export const noopDiscordProxyLogger: DiscordProxyLogger = {
  error: () => {},
};

/** Ported from NzbDrone.Core/Notifications/Discord/DiscordProxy.cs. */
export interface IDiscordProxy {
  sendPayload(payload: DiscordPayload, settings: DiscordSettings): Promise<void>;
}

export class DiscordProxy implements IDiscordProxy {
  private readonly httpClient: IHttpClient;
  private readonly logger: DiscordProxyLogger;

  constructor(httpClient: IHttpClient, logger: DiscordProxyLogger = noopDiscordProxyLogger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  async sendPayload(payload: DiscordPayload, settings: DiscordSettings): Promise<void> {
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
        throw new DiscordException("Unable to post payload", { cause: ex });
      }

      throw ex;
    }
  }
}
