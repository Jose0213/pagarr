import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpAccept } from "../../http/HttpAccept.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import type { AppriseError } from "./AppriseError.js";
import { AppriseException } from "./AppriseException.js";
import { appriseNotificationTypeToApiValue } from "./AppriseNotificationType.js";
import type { ApprisePayload } from "./ApprisePayload.js";
import type { AppriseSettings } from "./AppriseSettings.js";

/** Minimal logger surface AppriseProxy needs. */
export interface AppriseProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: AppriseProxyLogger = { error: () => {} };

/** Ported from NzbDrone.Core/Notifications/Apprise/AppriseProxy.cs's `IAppriseProxy` interface. */
export interface IAppriseProxy {
  sendNotification(title: string, message: string, settings: AppriseSettings): Promise<void>;
  test(settings: AppriseSettings): Promise<ValidationFailure | null>;
}

/** Ported from NzbDrone.Core/Notifications/Apprise/AppriseProxy.cs. */
export class AppriseProxy implements IAppriseProxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: AppriseProxyLogger = noopLogger
  ) {}

  async sendNotification(title: string, message: string, settings: AppriseSettings): Promise<void> {
    const payload: ApprisePayload = {
      title,
      body: message,
      type: settings.notificationType,
    };

    const requestBuilder = new HttpRequestBuilder(settings.serverUrl.replace(/[/ ]+$/, ""))
      .post()
      .accept(HttpAccept.Json);

    if (settings.configurationKey && settings.configurationKey.trim() !== "") {
      requestBuilder.resource("/notify/{configurationKey}");
      requestBuilder.setSegment("configurationKey", settings.configurationKey);
    } else if (settings.statelessUrls && settings.statelessUrls.trim() !== "") {
      requestBuilder.resource("/notify");
      payload.urls = settings.statelessUrls;
    }

    if (settings.tags.length > 0) {
      payload.tag = settings.tags.join(",");
    }

    if (
      (settings.authUsername && settings.authUsername.trim() !== "") ||
      (settings.authPassword && settings.authPassword.trim() !== "")
    ) {
      requestBuilder.networkCredential = basicNetworkCredential(
        settings.authUsername,
        settings.authPassword
      );
    }

    const request = requestBuilder.build();

    request.headers.contentType = "application/json";
    request.setContent(
      JSON.stringify({
        ...(payload.urls !== undefined ? { Urls: payload.urls } : {}),
        Title: payload.title,
        Body: payload.body,
        Type: appriseNotificationTypeToApiValue(payload.type),
        ...(payload.tag !== undefined ? { Tag: payload.tag } : {}),
      })
    );

    try {
      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        this.logger.error("Unable to send message", ex);
        throw new AppriseException(`Unable to send Apprise notifications: ${ex.message}`, {
          cause: ex,
        });
      }

      throw ex;
    }
  }

  async test(settings: AppriseSettings): Promise<ValidationFailure | null> {
    const title = "Readarr - Test Notification";
    const body = "Success! You have properly configured your apprise notification settings.";

    try {
      await this.sendNotification(title, body, settings);
    } catch (ex) {
      if (ex instanceof AppriseException && ex.cause instanceof HttpException) {
        const httpException = ex.cause;

        if (httpException.response.statusCode === 401) {
          this.logger.error(`HTTP Auth credentials are invalid: ${ex.message}`, ex);
          return {
            propertyName: "AuthUsername",
            errorMessage: `HTTP Auth credentials are invalid: ${ex.message}`,
          };
        }

        if (httpException.response.content && httpException.response.content.trim() !== "") {
          const error = JSON.parse(httpException.response.content) as AppriseError;

          this.logger.error(`Unable to send test message. Response from API: ${error.error}`, ex);
          return {
            propertyName: "",
            errorMessage: `Unable to send test message. Response from API: ${error.error}`,
          };
        }

        this.logger.error(
          `Unable to send test message. Server connection failed: (${httpException.response.statusCode}) ${ex.message}`,
          ex
        );
        return {
          propertyName: "Url",
          errorMessage: `Unable to connect to Apprise API. Server connection failed: (${httpException.response.statusCode}) ${ex.message}`,
        };
      }

      this.logger.error("Unable to send test message", ex);
      return {
        propertyName: "Url",
        errorMessage: `Unable to send test message: ${ex instanceof Error ? ex.message : String(ex)}`,
      };
    }

    return null;
  }
}
