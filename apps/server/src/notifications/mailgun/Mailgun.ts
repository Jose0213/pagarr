/**
 * Ported from NzbDrone.Core/Notifications/Mailgun/Mailgun.cs.
 * C# class name is `MailGun` (capital G) -- exported here as `Mailgun` to
 * match this repo's directory/file naming (`mailgun/Mailgun.ts`) and this
 * task's brief naming the module "Mailgun"; the C# `public class MailGun`
 * identifier itself is noted here for anyone diffing against the original.
 */

import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { Author } from "../../books/models.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { IMailgunProxy } from "./MailgunProxy.js";
import type { MailgunSettings } from "./MailgunSettings.js";

/** Minimal logger surface, matching this port's convention elsewhere. */
export interface MailgunLogger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: MailgunLogger = { info: () => {}, error: () => {} };

/**
 * Ported from NzbDrone.Core/Notifications/Mailgun/Mailgun.cs's `MailGun`
 * class. NOTE: unlike every other notifier in this worktree, C#'s `MailGun`
 * does NOT override `OnDownloadFailure` or `OnImportFailure` -- those two
 * `INotification` hooks fall through to `NotificationBase`'s no-op virtual
 * defaults for Mailgun specifically. This is not an oversight in the port;
 * it's the real C# source (`Mailgun.cs` has no `OnDownloadFailure`/
 * `OnImportFailure` overrides at all, confirmed against the file). Preserved
 * faithfully -- `supportsOnDownloadFailure`/`supportsOnImportFailure` are
 * correspondingly left `false` in the `supports` flags below.
 */
export class Mailgun extends NotificationBase<MailgunSettings> {
  readonly name = "Mailgun";
  readonly configContract = "MailgunSettings";
  readonly link = "https://mailgun.com";

  private readonly proxy: IMailgunProxy;
  private readonly logger: MailgunLogger;

  constructor(proxy: IMailgunProxy, logger: MailgunLogger = noopLogger) {
    super();
    this.proxy = proxy;
    this.logger = logger;
  }

  override onGrab(grabMessage: GrabMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.BOOK_GRABBED_TITLE,
      grabMessage.message,
      this.settings
    );
  }

  override onReleaseImport(downloadMessage: BookDownloadMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.BOOK_DOWNLOADED_TITLE,
      downloadMessage.message,
      this.settings
    );
  }

  override onAuthorAdded(author: Author): void {
    void this.proxy.sendNotification(
      NotificationBase.AUTHOR_ADDED_TITLE,
      author.metadata?.name ?? "",
      this.settings
    );
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.AUTHOR_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.BOOK_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.BOOK_FILE_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override onHealthIssue(healthCheckMessage: HealthCheckLike): void {
    void this.proxy.sendNotification(
      NotificationBase.HEALTH_ISSUE_TITLE,
      healthCheckMessage.message,
      this.settings
    );
  }

  override onApplicationUpdate(updateMessage: ApplicationUpdateMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.APPLICATION_UPDATE_TITLE,
      updateMessage.message,
      this.settings
    );
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    try {
      const title = "Test Notification";
      const body = "This is a test message from Readarr, though Mailgun.";

      await this.proxy.sendNotification(title, body, this.settings);
      this.logger.info("Successsfully sent email though Mailgun.");
    } catch (ex) {
      this.logger.error("Unable to send test message though Mailgun.", ex);
      failures.push({
        propertyName: "",
        errorMessage: "Unable to send test message though Mailgun.",
      });
    }

    return { isValid: failures.length === 0, hasWarnings: false, errors: failures };
  }
}
