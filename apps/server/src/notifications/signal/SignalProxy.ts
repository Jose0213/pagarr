import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { basicNetworkCredential } from "../../http/HttpCredential.js";
import type { ValidationFailure } from "../../thingi-provider/index.js";
import type { SignalSettings } from "./SignalSettings.js";
import type { SignalPayload } from "./SignalPayload.js";
import type { SignalError } from "./SignalError.js";

/**
 * Ported from NzbDrone.Core/Notifications/Signal/SignalProxy.cs.
 *
 * DEVIATION -- error branches: like `telegram/TelegramProxy.ts`, the real
 * `Test()` has a `WebException` catch arm (network-level failure) with no
 * reachable equivalent in this port's fetch/undici-based `HttpClient` (see
 * that file's doc comment, and `http/HttpException.ts`'s header comment).
 * Dropped; any such failure now falls into the final generic `catch
 * (Exception ex)` arm, which the real C# already has as its own fallback
 * for anything not `WebException`/`HttpException` -- same "Host"/message
 * shape either way.
 */
/** Minimal logger surface SignalProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SignalProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

export const noopSignalProxyLogger: SignalProxyLogger = {
  error: () => {},
};

export interface ISignalProxy {
  sendNotification(title: string, message: string, settings: SignalSettings): Promise<void>;
  test(settings: SignalSettings): Promise<ValidationFailure | null>;
}

export class SignalProxy implements ISignalProxy {
  private readonly httpClient: IHttpClient;
  private readonly logger: SignalProxyLogger;

  constructor(httpClient: IHttpClient, logger: SignalProxyLogger = noopSignalProxyLogger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  async sendNotification(title: string, message: string, settings: SignalSettings): Promise<void> {
    // Ported from `StringBuilder.AppendLine(title); AppendLine(message);` --
    // .NET's AppendLine uses `Environment.NewLine`, which is `\r\n` on
    // Windows but `\n` everywhere else .NET/Readarr actually runs
    // (Docker/Linux is the deployed target). This port targets Node server
    // deployments the same way (Linux-hosted), so `\n` is used to match
    // real-world Readarr behavior rather than Windows-only `\r\n`.
    const text = `${title}\n${message}\n`;

    const urlSignalApi = HttpRequestBuilder.buildBaseUrl(
      settings.useSsl,
      settings.host,
      settings.port,
      "/v2/send"
    );

    const requestBuilder = new HttpRequestBuilder(urlSignalApi).post();

    if (
      settings.authUsername &&
      settings.authUsername.trim() !== "" &&
      settings.authPassword &&
      settings.authPassword.trim() !== ""
    ) {
      requestBuilder.networkCredential = basicNetworkCredential(
        settings.authUsername,
        settings.authPassword
      );
    }

    const request = requestBuilder.build();

    request.headers.contentType = "application/json";

    const payload: SignalPayload = {
      message: text,
      number: settings.senderNumber,
      recipients: [settings.receiverId],
    };
    request.setContent(JSON.stringify(payload));

    await this.httpClient.post(request);
  }

  async test(settings: SignalSettings): Promise<ValidationFailure | null> {
    try {
      const title = "Test Notification";
      const body = "This is a test message from Readarr";

      await this.sendNotification(title, body, settings);
    } catch (ex) {
      if (ex instanceof HttpException) {
        this.logger.error("Unable to send test message: %s", ex.message, ex);

        if (ex.response.statusCode === 400) {
          if (
            containsIgnoreCase(
              ex.response.content,
              "400 The plain HTTP request was sent to HTTPS port"
            )
          ) {
            return { propertyName: "UseSsl", errorMessage: "SSL seems to be required" };
          }

          const error = JSON.parse(ex.response.content) as SignalError;

          let property = "Host";

          if (containsIgnoreCase(error.error, "Invalid group id")) {
            property = "ReceiverId";
          } else if (containsIgnoreCase(error.error, "Invalid account")) {
            property = "SenderNumber";
          }

          return {
            propertyName: property,
            errorMessage: `Unable to send test message: ${error.error}`,
          };
        }

        if (ex.response.statusCode === 401) {
          return { propertyName: "AuthUsername", errorMessage: "Login/Password invalid" };
        }

        return { propertyName: "Host", errorMessage: `Unable to send test message: ${ex.message}` };
      }

      const message = ex instanceof Error ? ex.message : String(ex);
      this.logger.error("Unable to send test message: %s", message, ex);
      return { propertyName: "Host", errorMessage: `Unable to send test message: ${message}` };
    }

    return null;
  }
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.ContainsIgnoreCase()`. */
function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
