/**
 * Ported from NzbDrone.Core/Notifications/Mailgun/MailgunProxy.cs.
 *
 * DEVIATION -- credential kind: the C# builds a plain `NetworkCredential("api",
 * settings.ApiKey)` (not `BasicNetworkCredential`), which normally
 * participates in .NET's challenge/response auth flow. Mailgun's API expects
 * HTTP Basic auth sent up front on every request (username `"api"`, password
 * = the API key) with no actual challenge round-trip, so in practice this
 * behaves identically to Basic auth. This port's HTTP dispatcher only
 * implements `BasicNetworkCredential` (challenge/response `NetworkCredential`
 * throws -- see `http/dispatchers/ManagedHttpDispatcher.ts`'s file header),
 * matching the same substitution `download-clients/qbittorrent/QBittorrentProxyV1.ts`
 * already made for the same reason. Behavior-preserving, not a shortcut.
 */

import type { IHttpClient } from "../../http/HttpClient.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import { MailgunException } from "./MailgunException.js";
import type { MailgunSettings } from "./MailgunSettings.js";

const BASE_URL_EU = "https://api.eu.mailgun.net/v3";
const BASE_URL_US = "https://api.mailgun.net/v3";

export interface IMailgunProxy {
  sendNotification(title: string, message: string, settings: MailgunSettings): Promise<void>;
}

export class MailgunProxy implements IMailgunProxy {
  constructor(private readonly httpClient: IHttpClient) {}

  async sendNotification(title: string, message: string, settings: MailgunSettings): Promise<void> {
    try {
      const requestBuilder = this.buildRequest(
        settings,
        `${settings.senderDomain}/messages`,
        title,
        message
      );
      const request = requestBuilder.build();

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          throw new MailgunException("Unauthorised - ApiKey is invalid");
        }

        throw new MailgunException(
          `Unable to connect to Mailgun. Status code: ${ex.response.statusCode}`
        );
      }

      throw ex;
    }
  }

  private buildRequest(
    settings: MailgunSettings,
    resource: string,
    messageSubject: string,
    messageBody: string
  ): HttpRequestBuilder {
    const url = settings.useEuEndpoint ? BASE_URL_EU : BASE_URL_US;
    const requestBuilder = new HttpRequestBuilder(url).resource(resource).post();

    requestBuilder.networkCredential = basicNetworkCredential("api", settings.apiKey);

    requestBuilder.addFormParameter("from", settings.from);

    for (const recipient of settings.recipients) {
      requestBuilder.addFormParameter("to", recipient);
    }

    requestBuilder.addFormParameter("subject", messageSubject);
    requestBuilder.addFormParameter("text", messageBody);

    return requestBuilder;
  }
}
