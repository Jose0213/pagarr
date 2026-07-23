import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { WebhookPayload } from "../webhook/WebhookPayloads.js";
import { NotifiarrException } from "./NotifiarrException.js";
import type { NotifiarrSettings } from "./NotifiarrSettings.js";

/** Minimal logger surface NotifiarrProxy needs. */
export interface NotifiarrProxyLogger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: NotifiarrProxyLogger = { warn: () => {}, error: () => {} };

/** Ported from NzbDrone.Core/Notifications/Notifiarr/NotifiarrProxy.cs's `INotifiarrProxy` interface. */
export interface INotifiarrProxy {
  sendNotification(payload: WebhookPayload, settings: NotifiarrSettings): Promise<void>;
}

/** Ported from NzbDrone.Core/Notifications/Notifiarr/NotifiarrProxy.cs. */
export class NotifiarrProxy implements INotifiarrProxy {
  private static readonly URL = "https://notifiarr.com";

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: NotifiarrProxyLogger = noopLogger
  ) {}

  async sendNotification(payload: WebhookPayload, settings: NotifiarrSettings): Promise<void> {
    await this.processNotification(payload, settings);
  }

  private async processNotification(
    payload: WebhookPayload,
    settings: NotifiarrSettings
  ): Promise<void> {
    try {
      const requestBuilder = new HttpRequestBuilder(
        `${NotifiarrProxy.URL}/api/v1/notification/readarr`
      )
        .accept(HttpAccept.Json)
        .setHeader("X-API-Key", settings.apiKey);

      const request = requestBuilder.build();

      request.method = "POST";
      request.headers.contentType = "application/json";
      request.setContent(JSON.stringify(payload));

      await this.httpClient.post(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        const responseCode = ex.response.statusCode;

        switch (responseCode) {
          case 401:
            this.logger.warn("HTTP 401 - API key is invalid");
            throw new NotifiarrException("API key is invalid");
          case 400:
            // 400 responses shouldn't be treated as an actual error because it's a misconfiguration
            // between Readarr and Notifiarr for a specific event, but shouldn't stop all events.
            this.logger.warn(
              "HTTP 400 - Unable to send notification. Ensure Readarr Integration is enabled & assigned a channel on Notifiarr"
            );
            return;
          case 502:
          case 503:
          case 504:
            this.logger.warn("Unable to send notification. Service Unavailable");
            throw new NotifiarrException("Unable to send notification. Service Unavailable", {
              cause: ex,
            });
          case 520:
          case 521:
          case 522:
          case 523:
          case 524:
            throw new NotifiarrException(
              "Cloudflare Related HTTP Error - Unable to send notification",
              { cause: ex }
            );
          default:
            this.logger.error("Unknown HTTP Error - Unable to send notification", ex);
            throw new NotifiarrException("Unknown HTTP Error - Unable to send notification", {
              cause: ex,
            });
        }
      }

      throw ex;
    }
  }
}
