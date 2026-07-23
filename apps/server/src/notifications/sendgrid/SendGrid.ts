/** Ported from NzbDrone.Core/Notifications/SendGrid/SendGrid.cs. */

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
import type { ISendGridProxy } from "./SendGridProxy.js";
import type { SendGridSettings } from "./SendGridSettings.js";

/** Minimal logger surface, matching this port's convention elsewhere. */
export interface SendGridLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: SendGridLogger = { error: () => {} };

export class SendGrid extends NotificationBase<SendGridSettings> {
  readonly name = "SendGrid";
  readonly configContract = "SendGridSettings";
  readonly link = "https://sendgrid.com/";

  private readonly proxy: ISendGridProxy;
  private readonly logger: SendGridLogger;

  constructor(proxy: ISendGridProxy, logger: SendGridLogger = noopLogger) {
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

  override onReleaseImport(message: BookDownloadMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.BOOK_DOWNLOADED_TITLE,
      message.message,
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

  override onHealthIssue(healthCheck: HealthCheckLike): void {
    void this.proxy.sendNotification(
      NotificationBase.HEALTH_ISSUE_TITLE,
      healthCheck.message,
      this.settings
    );
  }

  override onDownloadFailure(message: DownloadFailedMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.DOWNLOAD_FAILURE_TITLE,
      message.message,
      this.settings
    );
  }

  override onImportFailure(message: BookDownloadMessage): void {
    void this.proxy.sendNotification(
      NotificationBase.IMPORT_FAILURE_TITLE,
      message.message,
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
      const body = "This is a test message from Readarr";

      await this.proxy.sendNotification(title, body, this.settings);
    } catch (ex) {
      this.logger.error("Unable to send test message", ex);
      failures.push({ propertyName: "", errorMessage: "Unable to send test message" });
    }

    return { isValid: failures.length === 0, hasWarnings: false, errors: failures };
  }
}
