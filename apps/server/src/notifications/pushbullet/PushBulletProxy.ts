import type { IHttpClient } from "../../http/HttpClient.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { PushBulletException } from "./PushBulletException.js";
import type { PushBulletDevice, PushBulletDevicesResponse } from "./PushBulletDevice.js";
import type { PushBulletSettings } from "./PushBulletSettings.js";

/** Minimal logger surface PushBulletProxy needs. */
export interface PushBulletProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: PushBulletProxyLogger = { error: () => {} };

/** Ported from NzbDrone.Core/Notifications/PushBullet/PushBulletProxy.cs's `IPushBulletProxy` interface. */
export interface IPushBulletProxy {
  sendNotification(title: string, message: string, settings: PushBulletSettings): Promise<void>;
  getDevices(settings: PushBulletSettings): Promise<PushBulletDevice[]>;
  test(settings: PushBulletSettings): Promise<ValidationFailure | null>;
}

/** Ported from NzbDrone.Core/Notifications/PushBullet/PushBulletProxy.cs. */
export class PushBulletProxy implements IPushBulletProxy {
  private static readonly PUSH_URL = "https://api.pushbullet.com/v2/pushes";
  private static readonly DEVICE_URL = "https://api.pushbullet.com/v2/devices";

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: PushBulletProxyLogger = noopLogger
  ) {}

  /**
   * Ported from `PushBulletProxy.SendNotification(title, message,
   * settings)`: fans out to channel tags if any are configured, else to
   * device IDs if any are configured, else to "all devices" (a single
   * request with no device/channel param). Collects per-target failures
   * and throws one combined exception at the end if ANY target failed --
   * matches the real C#'s `error` flag + final throw.
   */
  async sendNotification(
    title: string,
    message: string,
    settings: PushBulletSettings
  ): Promise<void> {
    let error = false;

    if (settings.channelTags.length > 0) {
      for (const channelTag of settings.channelTags) {
        const request = this.buildChannelRequest(channelTag);

        try {
          await this.sendNotificationInternal(title, message, request, settings);
        } catch (ex) {
          if (ex instanceof PushBulletException) {
            this.logger.error(`Unable to send test message to ${channelTag}`, ex);
            error = true;
          } else {
            throw ex;
          }
        }
      }
    } else if (settings.deviceIds.length > 0) {
      for (const deviceId of settings.deviceIds) {
        const request = this.buildDeviceRequest(deviceId);

        try {
          await this.sendNotificationInternal(title, message, request, settings);
        } catch (ex) {
          if (ex instanceof PushBulletException) {
            this.logger.error(`Unable to send test message to ${deviceId}`, ex);
            error = true;
          } else {
            throw ex;
          }
        }
      }
    } else {
      const request = this.buildDeviceRequest(null);

      try {
        await this.sendNotificationInternal(title, message, request, settings);
      } catch (ex) {
        if (ex instanceof PushBulletException) {
          this.logger.error("Unable to send test message to all devices", ex);
          error = true;
        } else {
          throw ex;
        }
      }
    }

    if (error) {
      throw new PushBulletException(
        "Unable to send PushBullet notifications to all channels or devices"
      );
    }
  }

  async getDevices(settings: PushBulletSettings): Promise<PushBulletDevice[]> {
    try {
      const requestBuilder = new HttpRequestBuilder(PushBulletProxy.DEVICE_URL);
      const request = requestBuilder.build();

      request.method = "GET";
      request.credentials = basicNetworkCredential(settings.apiKey, "");

      const response = await this.httpClient.execute(request);

      return (JSON.parse(response.content) as PushBulletDevicesResponse).devices;
    } catch (ex) {
      if (ex instanceof HttpException && ex.response.statusCode === 401) {
        this.logger.error("Access token is invalid", ex);
        throw ex;
      }
    }

    return [];
  }

  async test(settings: PushBulletSettings): Promise<ValidationFailure | null> {
    try {
      const title = "Readarr - Test Notification";
      const body = "This is a test message from Readarr";

      await this.sendNotification(title, body, settings);
    } catch (ex) {
      if (ex instanceof HttpException && ex.response.statusCode === 401) {
        this.logger.error("API Key is invalid", ex);
        return { propertyName: "ApiKey", errorMessage: "API Key is invalid" };
      }

      this.logger.error("Unable to send test message", ex);
      return { propertyName: "ApiKey", errorMessage: "Unable to send test message" };
    }

    return null;
  }

  private buildDeviceRequest(deviceId: string | null): HttpRequestBuilder {
    const requestBuilder = new HttpRequestBuilder(PushBulletProxy.PUSH_URL).post();

    if (deviceId === null || deviceId.trim() === "") {
      return requestBuilder;
    }

    // Ported from `long.TryParse(deviceId, out var integerId)` -- PushBullet
    // device IDs are normally opaque strings ("idens"), but the real C#
    // still special-cases a pure-integer-looking ID as `device_id` vs the
    // string `device_iden` param. Preserved faithfully even though every
    // real PushBullet device ID observed in practice is non-numeric.
    if (/^-?\d+$/.test(deviceId)) {
      requestBuilder.addFormParameter("device_id", deviceId);
    } else {
      requestBuilder.addFormParameter("device_iden", deviceId);
    }

    return requestBuilder;
  }

  private buildChannelRequest(channelTag: string): HttpRequestBuilder {
    const requestBuilder = new HttpRequestBuilder(PushBulletProxy.PUSH_URL).post();

    if (channelTag && channelTag.trim() !== "") {
      requestBuilder.addFormParameter("channel_tag", channelTag);
    }

    return requestBuilder;
  }

  private async sendNotificationInternal(
    title: string,
    message: string,
    requestBuilder: HttpRequestBuilder,
    settings: PushBulletSettings
  ): Promise<void> {
    try {
      requestBuilder
        .addFormParameter("type", "note")
        .addFormParameter("title", title)
        .addFormParameter("body", message);

      if (settings.senderId && settings.senderId.trim() !== "") {
        requestBuilder.addFormParameter("source_device_iden", settings.senderId);
      }

      const request = requestBuilder.build();

      request.credentials = basicNetworkCredential(settings.apiKey, "");

      await this.httpClient.execute(request);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          this.logger.error("Access token is invalid", ex);
          throw ex;
        }

        throw new PushBulletException(`Unable to send text message: ${ex.message}`, {
          cause: ex,
        });
      }

      throw ex;
    }
  }
}
