import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { ValidationFailure } from "../../thingi-provider/index.js";
import type { SimplepushSettings } from "./SimplepushSettings.js";

const URL = "https://api.simplepush.io/send";

/** Minimal logger surface SimplepushProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SimplepushProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

export const noopSimplepushProxyLogger: SimplepushProxyLogger = {
  error: () => {},
};

/**
 * Ported from NzbDrone.Core/Notifications/Simplepush/SimplepushProxy.cs.
 *
 * DEVIATION -- error handling: the real `Test()` catches plain `Exception`
 * (any failure at all -- not narrowed to `HttpException` like the other
 * four chat notifiers in this module) and always returns a generic
 * `ValidationFailure("ApiKey", "Unable to send test message")` regardless
 * of what actually went wrong. This is the ONLY chat notifier in this
 * module's scope that doesn't inspect the response body/status code for a
 * more specific error message -- preserved as-is (not "improved" to match
 * the richer error handling Telegram/Signal have), since that's a genuine
 * behavioral difference in the real C# across these five notifiers, not an
 * omission to fix.
 */
export interface ISimplepushProxy {
  sendNotification(title: string, message: string, settings: SimplepushSettings): Promise<void>;
  test(settings: SimplepushSettings): Promise<ValidationFailure | null>;
}

export class SimplepushProxy implements ISimplepushProxy {
  private readonly httpClient: IHttpClient;
  private readonly logger: SimplepushProxyLogger;

  constructor(httpClient: IHttpClient, logger: SimplepushProxyLogger = noopSimplepushProxyLogger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  async sendNotification(
    title: string,
    message: string,
    settings: SimplepushSettings
  ): Promise<void> {
    const requestBuilder = new HttpRequestBuilder(URL).post();

    requestBuilder
      .addFormParameter("key", settings.key)
      .addFormParameter("event", settings.event)
      .addFormParameter("title", title)
      .addFormParameter("msg", message);

    const request = requestBuilder.build();

    await this.httpClient.post(request);
  }

  async test(settings: SimplepushSettings): Promise<ValidationFailure | null> {
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
