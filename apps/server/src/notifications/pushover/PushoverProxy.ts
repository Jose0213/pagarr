import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { PushoverPriority } from "./PushoverPriority.js";
import type { PushoverSettings } from "./PushoverSettings.js";

/** Minimal logger surface PushoverProxy needs. */
export interface PushoverProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: PushoverProxyLogger = { error: () => {} };

/** Ported from NzbDrone.Core/Notifications/Pushover/PushoverProxy.cs's `IPushoverProxy` interface. */
export interface IPushoverProxy {
  sendNotification(title: string, message: string, settings: PushoverSettings): Promise<void>;
  test(settings: PushoverSettings): Promise<ValidationFailure | null>;
}

/** Ported from NzbDrone.Core/Notifications/Pushover/PushoverProxy.cs. */
export class PushoverProxy implements IPushoverProxy {
  private static readonly URL = "https://api.pushover.net/1/messages.json";

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: PushoverProxyLogger = noopLogger
  ) {}

  async sendNotification(
    title: string,
    message: string,
    settings: PushoverSettings
  ): Promise<void> {
    const requestBuilder = new HttpRequestBuilder(PushoverProxy.URL).post();

    requestBuilder
      .addFormParameter("token", settings.apiKey)
      .addFormParameter("user", settings.userKey)
      .addFormParameter("device", settings.devices.join(","))
      .addFormParameter("title", title)
      .addFormParameter("message", message)
      .addFormParameter("priority", settings.priority);

    if (settings.priority === PushoverPriority.Emergency) {
      requestBuilder.addFormParameter("retry", settings.retry);
      requestBuilder.addFormParameter("expire", settings.expire);
    }

    if (settings.sound && settings.sound.trim() !== "") {
      requestBuilder.addFormParameter("sound", settings.sound);
    }

    const request = requestBuilder.build();

    await this.httpClient.post(request);
  }

  async test(settings: PushoverSettings): Promise<ValidationFailure | null> {
    try {
      const title = "Test Notification";
      const body = "This is a test message from Readarr";

      await this.sendNotification(title, body, settings);
    } catch (ex) {
      this.logger.error("Unable to send test message", ex);
      return { propertyName: "ApiKey", errorMessage: "Unable to send test message" };
    }

    return null;
  }
}
