/** Ported from NzbDrone.Core/Notifications/Twitter/Twitter.cs. */

import { BadRequestException } from "../../exceptions/BadRequestException.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { Author } from "../../books/models.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { DownloadFailedMessage } from "../DownloadFailedMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { ITwitterService } from "./TwitterService.js";
import type { TwitterSettings } from "./TwitterSettings.js";

export class Twitter extends NotificationBase<TwitterSettings> {
  readonly name = "Twitter";
  readonly configContract = "TwitterSettings";
  readonly link = "https://twitter.com/";

  private readonly twitterService: ITwitterService;

  constructor(twitterService: ITwitterService) {
    super();
    this.twitterService = twitterService;
  }

  override onGrab(message: GrabMessage): void {
    void this.twitterService.sendNotification(`Grabbed: ${message.message}`, this.settings);
  }

  override onReleaseImport(message: BookDownloadMessage): void {
    void this.twitterService.sendNotification(`Imported: ${message.message}`, this.settings);
  }

  override onAuthorAdded(author: Author): void {
    void this.twitterService.sendNotification(
      `Author added: ${author.metadata?.name ?? ""}`,
      this.settings
    );
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): void {
    void this.twitterService.sendNotification(`Deleted: ${deleteMessage.message}`, this.settings);
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): void {
    void this.twitterService.sendNotification(`Deleted: ${deleteMessage.message}`, this.settings);
  }

  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): void {
    void this.twitterService.sendNotification(`Deleted: ${deleteMessage.message}`, this.settings);
  }

  override onHealthIssue(healthCheck: HealthCheckLike): void {
    void this.twitterService.sendNotification(
      `Health Issue: ${healthCheck.message}`,
      this.settings
    );
  }

  override onDownloadFailure(message: DownloadFailedMessage): void {
    void this.twitterService.sendNotification(`Download Failed: ${message.message}`, this.settings);
  }

  override onImportFailure(message: BookDownloadMessage): void {
    void this.twitterService.sendNotification(`Import Failed: ${message.message}`, this.settings);
  }

  override onApplicationUpdate(updateMessage: ApplicationUpdateMessage): void {
    void this.twitterService.sendNotification(
      `Application Updated: ${updateMessage.message}`,
      this.settings
    );
  }

  override async requestAction(action: string, query: Record<string, string>): Promise<unknown> {
    if (action === "startOAuth") {
      this.throwIfInvalid(["consumerKey", "consumerSecret"]);

      if (!query.callbackUrl) {
        throw new BadRequestException("QueryParam callbackUrl invalid.");
      }

      const oauthRedirectUrl = await this.twitterService.getOAuthRedirect(
        this.settings.consumerKey,
        this.settings.consumerSecret,
        query.callbackUrl
      );
      return { oauthUrl: oauthRedirectUrl };
    } else if (action === "getOAuthToken") {
      this.throwIfInvalid(["consumerKey", "consumerSecret"]);

      if (!query.oauth_token) {
        throw new BadRequestException("QueryParam oauth_token invalid.");
      }

      if (!query.oauth_verifier) {
        throw new BadRequestException("QueryParam oauth_verifier invalid.");
      }

      const oauthToken = await this.twitterService.getOAuthToken(
        this.settings.consumerKey,
        this.settings.consumerSecret,
        query.oauth_token,
        query.oauth_verifier
      );
      return {
        accessToken: oauthToken.accessToken,
        accessTokenSecret: oauthToken.accessTokenSecret,
      };
    }

    return {};
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.twitterService.test(this.settings);
    if (failure !== null) {
      failures.push(failure);
    }

    return { isValid: failures.length === 0, hasWarnings: false, errors: failures };
  }

  /**
   * Ported from `Settings.Validate().Filter("ConsumerKey",
   * "ConsumerSecret").ThrowOnError()` -- the real `NzbDroneValidationResult`
   * filter/throw machinery isn't ported (out of scope, see
   * `thingi-provider/IProviderConfig.ts`'s doc comment); this reproduces the
   * same "throw if any of these named fields fail validation" behavior
   * directly against the plain `ValidationResult` shape this port uses.
   * Property names here are this port's camelCase field names (`consumerKey`
   * / `consumerSecret`), not C#'s PascalCase (`ConsumerKey`/`ConsumerSecret`).
   */
  private throwIfInvalid(propertyNames: string[]): void {
    const result = this.settings.validate();
    const relevant = result.errors.filter(
      (e) => propertyNames.includes(e.propertyName) && !e.isWarning
    );

    if (relevant.length > 0) {
      throw new BadRequestException(relevant.map((e) => e.errorMessage).join(" "));
    }
  }
}
