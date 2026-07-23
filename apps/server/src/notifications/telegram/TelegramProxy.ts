import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { ValidationFailure } from "../../thingi-provider/index.js";
import type { TelegramSettings } from "./TelegramSettings.js";
import type { TelegramError } from "./TelegramError.js";

const URL = "https://api.telegram.org";

/**
 * Ported from `System.Web.HttpUtility.HtmlEncode()` -- the subset of
 * entities .NET's HtmlEncode actually escapes for a plain ASCII string:
 * `&`, `<`, `>`, `"`. (.NET's HtmlEncode does NOT escape `'` -- only
 * `HtmlAttributeEncode` does that -- so `'` is intentionally left alone
 * here to match.)
 */
export function htmlEncode(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Ported from NzbDrone.Core/Notifications/Telegram/TelegramService.cs.
 *
 * DEVIATION -- error branches: the real `Test()` catches `Exception`
 * (everything) with two `if`/`else if` type-checks inside: `WebException`
 * (network-level failure, returns a "Connection" property failure built
 * from `webException.Status`) and `Common.Http.HttpException` with a 400
 * response (parses `TelegramError` off the body, maps known Description
 * substrings to a more specific property name). Anything matching neither
 * falls through to the generic `return new ValidationFailure("BotToken",
 * "Unable to send test message")`. This port's `HttpClient` has no
 * `WebException` equivalent (see `http/HttpException.ts`'s header comment
 * on why `TlsFailureException` -- .NET's WebException-adjacent TLS failure
 * type -- isn't ported either: undici surfaces transport failures as a
 * generic `TypeError`, not a distinguishable exception type reachable
 * here), so the `WebException`/"Connection" branch has no reachable
 * equivalent and is dropped; every other failure (including what would
 * have been a `WebException` in the real runtime) falls through to the
 * same generic `BotToken`/"Unable to send test message" fallback the real
 * code already uses for its own unmatched-exception case -- not a
 * behavior change, just one fewer distinguishable branch given this port's
 * narrower exception taxonomy.
 */
/** Minimal logger surface TelegramProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface TelegramProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

export const noopTelegramProxyLogger: TelegramProxyLogger = {
  error: () => {},
};

export interface ITelegramProxy {
  sendNotification(title: string, message: string, settings: TelegramSettings): Promise<void>;
  test(settings: TelegramSettings): Promise<ValidationFailure | null>;
}

export class TelegramProxy implements ITelegramProxy {
  private readonly httpClient: IHttpClient;
  private readonly logger: TelegramProxyLogger;

  constructor(httpClient: IHttpClient, logger: TelegramProxyLogger = noopTelegramProxyLogger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  async sendNotification(
    title: string,
    message: string,
    settings: TelegramSettings
  ): Promise<void> {
    // Format text to add the title before and bold using markdown (well,
    // HTML -- parse_mode is "HTML", the comment in the C# source is stale).
    const text = `<b>${htmlEncode(title)}</b>\n${htmlEncode(message)}`;

    const requestBuilder = new HttpRequestBuilder(URL).resource("bot{token}/sendmessage").post();

    const request = requestBuilder
      .setSegment("token", settings.botToken)
      .addFormParameter("chat_id", settings.chatId)
      .addFormParameter("parse_mode", "HTML")
      .addFormParameter("text", text)
      .addFormParameter("disable_notification", settings.sendSilently)
      .addFormParameter("message_thread_id", settings.topicId)
      .build();

    await this.httpClient.post(request);
  }

  async test(settings: TelegramSettings): Promise<ValidationFailure | null> {
    try {
      const title = "Test Notification";
      const body = "This is a test message from Readarr";

      await this.sendNotification(title, body, settings);
    } catch (ex) {
      this.logger.error("Unable to send test message", ex);

      if (ex instanceof HttpException && ex.response.statusCode === 400) {
        const error = JSON.parse(ex.response.content) as TelegramError;
        let property = "BotToken";

        const description = error.description ?? "";
        if (
          containsIgnoreCase(description, "chat not found") ||
          containsIgnoreCase(description, "group chat was upgraded to a supergroup chat")
        ) {
          property = "ChatId";
        } else if (containsIgnoreCase(description, "message thread not found")) {
          property = "TopicId";
        }

        return { propertyName: property, errorMessage: error.description };
      }

      return { propertyName: "BotToken", errorMessage: "Unable to send test message" };
    }

    return null;
  }
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.ContainsIgnoreCase()`. */
function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
