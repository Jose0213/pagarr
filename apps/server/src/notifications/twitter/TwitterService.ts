/**
 * Ported from NzbDrone.Core/Notifications/Twitter/TwitterService.cs.
 *
 * DEVIATION -- error handling: C# catches `System.Net.WebException` and
 * reads the raw `HttpWebResponse`/response stream to build the
 * `TwitterException` message. This port's HTTP layer surfaces failed
 * requests as `HttpException` (see `http/HttpException.ts`) with a
 * `response` field already holding the parsed status/content -- so the
 * catch block here is written against `HttpException` instead, achieving
 * the same "log status + body, wrap in TwitterException" behavior without
 * a manual stream-read (which `HttpException.response.content`/`statusCode`
 * already give us). This is the same interceptor-vs-manual-response-read
 * shape difference every other ported notifier's HTTP error handling deals
 * with (e.g. `SendGridProxy.ts`, `MailgunProxy.ts` in this same worktree).
 */
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { HttpException } from "../../http/HttpException.js";
import type { OAuthToken } from "./OAuthToken.js";
import { TwitterException } from "./TwitterException.js";
import type { ITwitterProxy } from "./TwitterProxy.js";
import type { TwitterSettings } from "./TwitterSettings.js";

/** Minimal logger surface, matching this port's convention elsewhere. */
export interface TwitterServiceLogger {
  trace(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: TwitterServiceLogger = { trace: () => {}, error: () => {} };

export interface ITwitterService {
  sendNotification(message: string, settings: TwitterSettings): Promise<void>;
  test(settings: TwitterSettings): Promise<ValidationFailure | null>;
  getOAuthRedirect(
    consumerKey: string,
    consumerSecret: string,
    callbackUrl: string
  ): Promise<string>;
  getOAuthToken(
    consumerKey: string,
    consumerSecret: string,
    oauthToken: string,
    oauthVerifier: string
  ): Promise<OAuthToken>;
}

export class TwitterService implements ITwitterService {
  constructor(
    private readonly twitterProxy: ITwitterProxy,
    private readonly logger: TwitterServiceLogger = noopLogger
  ) {}

  async getOAuthToken(
    consumerKey: string,
    consumerSecret: string,
    oauthToken: string,
    oauthVerifier: string
  ): Promise<OAuthToken> {
    const qscoll = await this.twitterProxy.getOAuthToken(
      consumerKey,
      consumerSecret,
      oauthToken,
      oauthVerifier
    );

    return {
      accessToken: qscoll.get("oauth_token"),
      accessTokenSecret: qscoll.get("oauth_token_secret"),
    };
  }

  getOAuthRedirect(
    consumerKey: string,
    consumerSecret: string,
    callbackUrl: string
  ): Promise<string> {
    return this.twitterProxy.getOAuthRedirect(consumerKey, consumerSecret, callbackUrl);
  }

  async sendNotification(message: string, settings: TwitterSettings): Promise<void> {
    try {
      if (settings.directMessage) {
        await this.twitterProxy.directMessage(message, settings);
      } else {
        let finalMessage = message;

        if (settings.mention) {
          finalMessage += ` @${settings.mention}`;
        }

        await this.twitterProxy.updateStatus(finalMessage, settings);
      }
    } catch (ex) {
      if (ex instanceof HttpException) {
        this.logger.trace(
          "Reponse: %s Status Code: %d",
          ex.response.content,
          ex.response.statusCode
        );
        throw new TwitterException(`Error received from Twitter: ${ex.response.content}`, {
          cause: ex,
        });
      }

      throw ex;
    }
  }

  async test(settings: TwitterSettings): Promise<ValidationFailure | null> {
    try {
      const body = `Readarr: Test Message @ ${new Date().toString()}`;

      await this.sendNotification(body, settings);
    } catch (ex) {
      this.logger.error("Unable to send test message", ex);
      return { propertyName: "Host", errorMessage: "Unable to send test message" };
    }

    return null;
  }
}
