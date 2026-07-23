import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { WebhookException } from "./WebhookException.js";
import { WebhookMethod } from "./WebhookMethod.js";
import type { WebhookPayload } from "./WebhookPayloads.js";
import type { WebhookSettings } from "./WebhookSettings.js";

/** Ported from NzbDrone.Core/Notifications/Webhook/WebhookProxy.cs. */
export interface IWebhookProxy {
  sendWebhook(payload: WebhookPayload, settings: WebhookSettings): Promise<void>;
}

export class WebhookProxy implements IWebhookProxy {
  constructor(private readonly httpClient: IHttpClient) {}

  async sendWebhook(body: WebhookPayload, settings: WebhookSettings): Promise<void> {
    try {
      const request = new HttpRequestBuilder(settings.url).accept(HttpAccept.Json).build();

      // `WebhookSettings.method` is a plain `number` for shape fidelity with
      // the real C# `int Method` field (see WebhookSettings.ts's doc
      // comment). Compared against `WebhookMethod`'s numeric values (not the
      // enum members directly, which `@typescript-eslint/no-unsafe-enum-comparison`
      // flags for a plain-number left-hand side) -- matches the C#'s
      // `switch` over the same underlying int values via
      // `(int)WebhookMethod.POST`/`(int)WebhookMethod.PUT`.
      const postValue: number = WebhookMethod.POST;
      const putValue: number = WebhookMethod.PUT;

      if (settings.method === postValue) {
        request.method = "POST";
      } else if (settings.method === putValue) {
        request.method = "PUT";
      } else {
        throw new RangeError(`Invalid Webhook method ${settings.method}`);
      }

      request.headers.contentType = "application/json";
      request.setContent(JSON.stringify(body));

      if (
        (settings.username && settings.username.trim() !== "") ||
        (settings.password && settings.password.trim() !== "")
      ) {
        request.credentials = basicNetworkCredential(settings.username, settings.password);
      }

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        throw new WebhookException("Unable to post to webhook: {0}", {
          args: [ex.message],
          cause: ex,
        });
      }

      throw ex;
    }
  }
}
