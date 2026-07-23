/**
 * Ported from NzbDrone.Core/Notifications/SendGrid/SendGridProxy.cs.
 * Uses this port's real `../../http` module (`HttpClient`/`HttpRequestBuilder`)
 * -- already ported for real, not a stand-in.
 */

import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { SendGridException } from "./SendGridException.js";
import {
  createSendGridPayload,
  createSendGridPersonalization,
  type SendGridPayload,
} from "./SendGridPayload.js";
import type { SendGridSettings } from "./SendGridSettings.js";

export interface ISendGridProxy {
  sendNotification(title: string, message: string, settings: SendGridSettings): Promise<void>;
}

export class SendGridProxy implements ISendGridProxy {
  constructor(private readonly httpClient: IHttpClient) {}

  async sendNotification(
    title: string,
    message: string,
    settings: SendGridSettings
  ): Promise<void> {
    try {
      const request = this.buildRequest(settings, "mail/send");

      const payload: SendGridPayload = createSendGridPayload();
      payload.from = { email: settings.from };
      payload.content.push({ type: "text/plain", value: message });

      const personalization = createSendGridPersonalization();
      personalization.subject = title;

      for (const recipient of settings.recipients) {
        personalization.to.push({ email: recipient });
      }

      payload.personalizations.push(personalization);

      request.setContent(JSON.stringify(payload));

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          throw new SendGridException("Unauthorized - AuthToken is invalid");
        }

        throw new SendGridException(
          `Unable to connect to SendGrid. Status Code: ${ex.response.statusCode}`
        );
      }

      throw ex;
    }
  }

  private buildRequest(settings: SendGridSettings, resource: string): HttpRequest {
    const request = new HttpRequestBuilder(settings.baseUrl)
      .resource(resource)
      .setHeader("Authorization", `Bearer ${settings.apiKey}`)
      .post()
      .build();

    request.headers.contentType = "application/json";

    return request;
  }
}
