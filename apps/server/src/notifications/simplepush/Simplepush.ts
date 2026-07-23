import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { DownloadFailedMessage } from "../DownloadFailedMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { Author } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/index.js";
import type { ISimplepushProxy } from "./SimplepushProxy.js";
import type { SimplepushSettings } from "./SimplepushSettings.js";

/** Ported from NzbDrone.Core/Notifications/Simplepush/Simplepush.cs. */
export class Simplepush extends NotificationBase<SimplepushSettings> {
  private readonly proxy: ISimplepushProxy;

  readonly name = "Simplepush";
  readonly configContract = "SimplepushSettings";
  readonly link = "https://simplepush.io/";

  constructor(proxy: ISimplepushProxy) {
    super();
    this.proxy = proxy;
  }

  override onGrab(grabMessage: GrabMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.BOOK_GRABBED_TITLE,
      grabMessage.message,
      this.settings
    );
  }

  override onReleaseImport(message: BookDownloadMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.BOOK_DOWNLOADED_TITLE,
      message.message,
      this.settings
    );
  }

  override onAuthorAdded(author: Author): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.AUTHOR_ADDED_TITLE,
      author.metadata?.name ?? "",
      this.settings
    );
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.AUTHOR_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.BOOK_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.BOOK_FILE_DELETED_TITLE,
      deleteMessage.message,
      this.settings
    );
  }

  override onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.HEALTH_ISSUE_TITLE,
      healthCheck.message,
      this.settings
    );
  }

  override onDownloadFailure(message: DownloadFailedMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.DOWNLOAD_FAILURE_TITLE,
      message.message,
      this.settings
    );
  }

  override onImportFailure(message: BookDownloadMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.IMPORT_FAILURE_TITLE,
      message.message,
      this.settings
    );
  }

  override onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    return this.proxy.sendNotification(
      NotificationBase.APPLICATION_UPDATE_TITLE,
      updateMessage.message,
      this.settings
    );
  }

  override async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.proxy.test(this.settings);
    if (failure !== null) {
      failures.push(failure);
    }

    return {
      isValid: failures.length === 0,
      hasWarnings: false,
      errors: failures,
    };
  }
}
