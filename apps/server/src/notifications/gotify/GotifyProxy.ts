import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import { GotifyException } from "./GotifyException.js";
import type { GotifySettings } from "./GotifySettings.js";

/** Ported from NzbDrone.Core/Notifications/Gotify/GotifyProxy.cs's `IGotifyProxy` interface. */
export interface IGotifyProxy {
  sendNotification(title: string, message: string, settings: GotifySettings): Promise<void>;
}

/** Ported from NzbDrone.Core/Notifications/Gotify/GotifyProxy.cs. */
export class GotifyProxy implements IGotifyProxy {
  constructor(private readonly httpClient: IHttpClient) {}

  async sendNotification(title: string, message: string, settings: GotifySettings): Promise<void> {
    try {
      const requestBuilder = new HttpRequestBuilder(settings.server).resource("message").post();

      requestBuilder
        .addQueryParam("token", settings.appToken)
        .addFormParameter("title", title)
        .addFormParameter("message", message)
        .addFormParameter("priority", settings.priority);

      const request = requestBuilder.build();

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          throw new GotifyException("Unauthorized - AuthToken is invalid");
        }

        throw new GotifyException(`Unable to connect to Gotify. Status Code: ${ex.message}`);
      }

      throw ex;
    }
  }
}
