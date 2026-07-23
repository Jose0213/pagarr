import type { IHttpClient } from "../../http/HttpClient.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { NtfyException } from "./NtfyException.js";
import type { NtfySettings } from "./NtfySettings.js";

/** Minimal logger surface NtfyProxy needs. */
export interface NtfyProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: NtfyProxyLogger = { error: () => {} };

/** Ported from NzbDrone.Core/Notifications/Ntfy/NtfyProxy.cs's `INtfyProxy` interface. */
export interface INtfyProxy {
  sendNotification(title: string, message: string, settings: NtfySettings): Promise<void>;
  test(settings: NtfySettings): Promise<ValidationFailure | null>;
}

/** Ported from NzbDrone.Core/Notifications/Ntfy/NtfyProxy.cs. */
export class NtfyProxy implements INtfyProxy {
  private static readonly DEFAULT_PUSH_URL = "https://ntfy.sh";

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: NtfyProxyLogger = noopLogger
  ) {}

  /** Ported from `NtfyProxy.SendNotification(title, message, settings)`: fans out to every configured topic, collecting per-topic failures and throwing one combined exception at the end if ANY topic failed. */
  async sendNotification(title: string, message: string, settings: NtfySettings): Promise<void> {
    let error = false;

    const serverUrl =
      settings.serverUrl && settings.serverUrl.trim() !== ""
        ? settings.serverUrl
        : NtfyProxy.DEFAULT_PUSH_URL;

    for (const topic of settings.topics) {
      const request = this.buildTopicRequest(serverUrl, topic);

      try {
        await this.sendNotificationInternal(title, message, request, settings);
      } catch (ex) {
        if (ex instanceof NtfyException) {
          this.logger.error(`Unable to send test message to ${topic}`, ex);
          error = true;
        } else {
          throw ex;
        }
      }
    }

    if (error) {
      throw new NtfyException("Unable to send Ntfy notifications to all topics");
    }
  }

  private buildTopicRequest(serverUrl: string, topic: string): HttpRequestBuilder {
    const trimServerUrl = serverUrl.replace(/\/+$/, "");
    return new HttpRequestBuilder(`${trimServerUrl}/${topic}`).post();
  }

  async test(settings: NtfySettings): Promise<ValidationFailure | null> {
    try {
      const title = "Readarr - Test Notification";
      const body = "This is a test message from Readarr";

      await this.sendNotification(title, body, settings);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401 || ex.response.statusCode === 403) {
          if (settings.accessToken && settings.accessToken.trim() !== "") {
            this.logger.error("Invalid token", ex);
            return { propertyName: "AccessToken", errorMessage: "Invalid token" };
          }

          if (
            settings.userName &&
            settings.userName.trim() !== "" &&
            settings.password &&
            settings.password.trim() !== ""
          ) {
            this.logger.error("Invalid username or password", ex);
            return { propertyName: "UserName", errorMessage: "Invalid username or password" };
          }

          this.logger.error("Authorization is required", ex);
          return { propertyName: "AccessToken", errorMessage: "Authorization is required" };
        }

        this.logger.error("Unable to send test message", ex);
        return { propertyName: "ServerUrl", errorMessage: "Unable to send test message" };
      }

      this.logger.error("Unable to send test message", ex);
      return { propertyName: "", errorMessage: "Unable to send test message" };
    }

    return null;
  }

  private async sendNotificationInternal(
    title: string,
    message: string,
    requestBuilder: HttpRequestBuilder,
    settings: NtfySettings
  ): Promise<void> {
    try {
      requestBuilder.addQueryParam("title", title);
      requestBuilder.addQueryParam("message", message);
      requestBuilder.addQueryParam("priority", String(settings.priority));

      if (settings.tags.length > 0) {
        requestBuilder.addQueryParam("tags", settings.tags.join(","));
      }

      if (settings.clickUrl && settings.clickUrl.trim() !== "") {
        requestBuilder.addQueryParam("click", settings.clickUrl);
      }

      if (settings.accessToken && settings.accessToken.trim() !== "") {
        requestBuilder.setHeader("Authorization", `Bearer ${settings.accessToken}`);
      } else if (
        settings.userName &&
        settings.userName.trim() !== "" &&
        settings.password &&
        settings.password.trim() !== ""
      ) {
        requestBuilder.networkCredential = basicNetworkCredential(
          settings.userName,
          settings.password
        );
      }

      const request = requestBuilder.build();

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401 || ex.response.statusCode === 403) {
          this.logger.error("Authorization is required", ex);
          throw ex;
        }

        throw new NtfyException(`Unable to send text message: ${ex.message}`, { cause: ex });
      }

      throw ex;
    }
  }
}
