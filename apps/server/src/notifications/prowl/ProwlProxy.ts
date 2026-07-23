import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { ProwlException } from "./ProwlException.js";
import type { ProwlSettings } from "./ProwlSettings.js";

/**
 * Ported from `NzbDrone.Common.EnvironmentInfo.BuildInfo.AppName`, a static
 * `"Readarr"` constant (not a computed/branded value) -- this port has no
 * existing BuildInfo forward-ref, so it's inlined here as the one field
 * ProwlProxy actually reads off it.
 */
const APP_NAME = "Readarr";

/** Minimal logger surface ProwlProxy needs. */
export interface ProwlProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: ProwlProxyLogger = { error: () => {} };

/** Ported from NzbDrone.Core/Notifications/Prowl/ProwlProxy.cs's `IProwlProxy` interface. */
export interface IProwlProxy {
  sendNotification(title: string, message: string, settings: ProwlSettings): Promise<void>;
  test(settings: ProwlSettings): Promise<ValidationFailure | null>;
}

/** Ported from NzbDrone.Core/Notifications/Prowl/ProwlProxy.cs. */
export class ProwlProxy implements IProwlProxy {
  private static readonly PUSH_URL = "https://api.prowlapp.com/publicapi/add";

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: ProwlProxyLogger = noopLogger
  ) {}

  async sendNotification(title: string, message: string, settings: ProwlSettings): Promise<void> {
    try {
      const requestBuilder = new HttpRequestBuilder(ProwlProxy.PUSH_URL);

      const request = requestBuilder
        .post()
        .addFormParameter("apikey", settings.apiKey)
        .addFormParameter("application", APP_NAME)
        .addFormParameter("event", title)
        .addFormParameter("description", message)
        .addFormParameter("priority", settings.priority)
        .build();

      await this.httpClient.post(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          this.logger.error(`Apikey is invalid: ${settings.apiKey}`, ex);
          throw new ProwlException("Apikey is invalid", { cause: ex });
        }

        throw new ProwlException(`Unable to send text message: ${ex.message}`, { cause: ex });
      }

      // Ported from `catch (WebException ex)` -- this port's HttpClient
      // surfaces connection-level failures as plain Error/TypeError (no
      // .NET WebException equivalent), so any non-HttpException failure
      // gets the same "failed to connect" treatment as the real C#'s
      // WebException branch.
      throw new ProwlException("Failed to connect to prowl, please check your settings.", {
        cause: ex,
      });
    }
  }

  async test(settings: ProwlSettings): Promise<ValidationFailure | null> {
    try {
      const title = "Test Notification";
      const body = "This is a test message from Readarr";

      await this.sendNotification(title, body, settings);
    } catch (ex) {
      return {
        propertyName: "ApiKey",
        errorMessage: ex instanceof Error ? ex.message : String(ex),
      };
    }

    return null;
  }
}
