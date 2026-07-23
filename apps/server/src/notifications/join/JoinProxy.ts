import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { JoinAuthException, JoinException, JoinInvalidDeviceException } from "./JoinException.js";
import type { JoinResponseModel } from "./JoinResponseModel.js";
import type { JoinSettings } from "./JoinSettings.js";

/** Minimal logger surface JoinProxy needs. */
export interface JoinProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: JoinProxyLogger = { error: () => {} };

/** Ported from NzbDrone.Core/Notifications/Join/JoinProxy.cs's `IJoinProxy` interface. */
export interface IJoinProxy {
  sendNotification(title: string, message: string, settings: JoinSettings): Promise<void>;
  test(settings: JoinSettings): Promise<ValidationFailure | null>;
}

/** Ported from NzbDrone.Core/Notifications/Join/JoinProxy.cs. */
export class JoinProxy implements IJoinProxy {
  private static readonly URL = "https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush?";

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: JoinProxyLogger = noopLogger
  ) {}

  /** Ported from the public `SendNotification(title, message, settings)` overload: delegates to the private one with `HttpMethod.Get`, wrapping JoinException for logging + rethrow. */
  async sendNotification(title: string, message: string, settings: JoinSettings): Promise<void> {
    try {
      await this.sendNotificationInternal(title, message, settings);
    } catch (ex) {
      if (ex instanceof JoinException) {
        this.logger.error("Unable to send Join message.", ex);
      }
      throw ex;
    }
  }

  /** Ported from `JoinProxy.Test(JoinSettings)`. */
  async test(settings: JoinSettings): Promise<ValidationFailure | null> {
    const title = "Test Notification";
    const body = "This is a test message from Readarr.";

    try {
      await this.sendNotification(title, body, settings);
      return null;
    } catch (ex) {
      if (ex instanceof JoinInvalidDeviceException) {
        this.logger.error("Unable to send test Join message. Invalid Device IDs supplied.", ex);
        return { propertyName: "DeviceIds", errorMessage: "Device IDs appear invalid." };
      }

      if (ex instanceof JoinException) {
        this.logger.error("Unable to send test Join message.", ex);
        return { propertyName: "ApiKey", errorMessage: ex.message };
      }

      // Ported from `catch (HttpException ex)` -- this port's HttpClient
      // throws HttpException for non-2xx responses same as the real C#.
      this.logger.error("Unable to send test Join message. Unknown error.", ex);
      return {
        propertyName: "ApiKey",
        errorMessage: ex instanceof Error ? ex.message : String(ex),
      };
    }
  }

  /** Ported from the private `SendNotification(title, message, HttpMethod method, settings)`. */
  private async sendNotificationInternal(
    title: string,
    message: string,
    settings: JoinSettings
  ): Promise<void> {
    const requestBuilder = new HttpRequestBuilder(JoinProxy.URL);

    if (settings.deviceNames && settings.deviceNames.trim() !== "") {
      requestBuilder.addQueryParam("deviceNames", settings.deviceNames);
    } else if (settings.deviceIds && settings.deviceIds.trim() !== "") {
      requestBuilder.addQueryParam("deviceIds", settings.deviceIds);
    } else {
      requestBuilder.addQueryParam("deviceId", "group.all");
    }

    requestBuilder
      .addQueryParam("apikey", settings.apiKey)
      .addQueryParam("title", title)
      .addQueryParam("text", message)
      // Use the Readarr logo.
      .addQueryParam("icon", "https://cdn.rawgit.com/Readarr/Readarr/develop/Logo/256.png")
      // 96x96px with outline at 88x88px on a transparent background.
      .addQueryParam(
        "smallicon",
        "https://cdn.rawgit.com/Readarr/Readarr/develop/Logo/96-Outline-White.png"
      )
      .addQueryParam("priority", settings.priority);

    const request = requestBuilder.build();
    request.method = "GET";

    const response = await this.httpClient.execute(request);
    const res = JSON.parse(response.content) as JoinResponseModel;

    if (res.success) {
      return;
    }

    if (res.userAuthError) {
      throw new JoinAuthException("Authentication failed.");
    }

    if (res.errorMessage != null) {
      // Unfortunately hard coding this string here is the only way to determine that there aren't any devices to send to.
      // There isn't an enum or flag contained in the response that can be used instead.
      if (res.errorMessage === "No devices to send to") {
        throw new JoinInvalidDeviceException(res.errorMessage);
      }

      // Oddly enough, rather than give us an "Invalid API key", the Join API seems to assume the key is valid,
      // but fails when doing a device lookup associated with that key.
      // In our case we are using "deviceIds" rather than "deviceId" so when the singular form error shows up
      // we know the API key was the fault.
      if (res.errorMessage === "No device to send message to") {
        throw new JoinAuthException("Authentication failed.");
      }

      throw new JoinException(res.errorMessage);
    }

    throw new JoinException("Unknown error. Join message failed to send.");
  }
}
