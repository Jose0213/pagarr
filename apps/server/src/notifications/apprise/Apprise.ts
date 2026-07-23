import type { Author } from "../../books/models.js";
import type { ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { DownloadFailedMessage } from "../DownloadFailedMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { IAppriseProxy } from "./AppriseProxy.js";
import type { AppriseSettings } from "./AppriseSettings.js";

/**
 * Ported from NzbDrone.Core/Notifications/Apprise/Apprise.cs.
 *
 * Apprise is a meta-notifier -- it proxies to a separately-hosted Apprise
 * server instance (https://github.com/caronc/apprise-api) which itself
 * fans out to dozens of other notification services. This port implements
 * the real Apprise HTTP API contract faithfully (AppriseProxy.ts) rather
 * than reimplementing any of the services Apprise itself proxies to.
 *
 * Overrides: OnGrab, OnReleaseImport, OnAuthorAdded, OnAuthorDelete,
 * OnBookDelete, OnBookFileDelete, OnHealthIssue, OnDownloadFailure,
 * OnImportFailure, OnApplicationUpdate. NOT overridden: OnRename,
 * OnBookRetag.
 */
export class Apprise extends NotificationBase<AppriseSettings> {
  readonly name = "Apprise";
  readonly link = "https://github.com/caronc/apprise";
  readonly configContract = "AppriseSettings";

  constructor(private readonly proxy: IAppriseProxy) {
    super();
  }

  override async onGrab(grabMessage: GrabMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_GRABBED_TITLE,
      grabMessage.message,
      this.settings
    );
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_DOWNLOADED_TITLE,
      message.message,
      this.settings
    );
  }

  override async onAuthorAdded(author: Author): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.AUTHOR_ADDED_TITLE,
      authorName(author),
      this.settings
    );
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.AUTHOR_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_FILE_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override async onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.HEALTH_ISSUE_TITLE,
      healthCheck.message,
      this.settings
    );
  }

  override async onDownloadFailure(message: DownloadFailedMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.DOWNLOAD_FAILURE_TITLE,
      message.message,
      this.settings
    );
  }

  override async onImportFailure(message: BookDownloadMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.IMPORT_FAILURE_TITLE,
      message.message,
      this.settings
    );
  }

  override async onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.APPLICATION_UPDATE_TITLE,
      updateMessage.message,
      this.settings
    );
  }

  async test(): Promise<ValidationResult> {
    const failure = await this.proxy.test(this.settings);
    const errors = failure ? [failure] : [];

    return {
      isValid: errors.length === 0,
      hasWarnings: false,
      errors,
    };
  }
}

function authorName(author: Author): string {
  return author.metadata?.name ?? "";
}
