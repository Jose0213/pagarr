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
import type { IGotifyProxy } from "./GotifyProxy.js";
import type { GotifySettings } from "./GotifySettings.js";

/** Minimal logger surface Gotify needs (used by `test()`, matching the real class's own injected `Logger`). */
export interface GotifyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: GotifyLogger = { error: () => {} };

/**
 * Ported from NzbDrone.Core/Notifications/Gotify/Gotify.cs.
 *
 * Overrides: OnGrab, OnReleaseImport, OnAuthorAdded, OnAuthorDelete,
 * OnBookDelete, OnBookFileDelete, OnHealthIssue, OnDownloadFailure,
 * OnImportFailure, OnApplicationUpdate. NOT overridden: OnRename,
 * OnBookRetag.
 */
export class Gotify extends NotificationBase<GotifySettings> {
  readonly name = "Gotify";
  readonly link = "https://gotify.net/";
  readonly configContract = "GotifySettings";

  constructor(
    private readonly proxy: IGotifyProxy,
    private readonly logger: GotifyLogger = noopLogger
  ) {
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

  /** Ported from `Gotify.Test()`: unlike most siblings, Gotify's own Test() try/catches directly around the proxy call rather than delegating to a proxy.Test() helper -- GotifyProxy has no `Test` method. */
  async test(): Promise<ValidationResult> {
    const failures: ValidationResult["errors"] = [];

    try {
      const title = "Test Notification";
      const body = "This is a test message from Readarr";

      await this.proxy.sendNotification(title, body, this.settings);
    } catch (ex) {
      this.logger.error("Unable to send test message", ex);
      failures.push({ propertyName: "", errorMessage: "Unable to send test message" });
    }

    return {
      isValid: failures.length === 0,
      hasWarnings: false,
      errors: failures,
    };
  }
}

function authorName(author: Author): string {
  return author.metadata?.name ?? "";
}
