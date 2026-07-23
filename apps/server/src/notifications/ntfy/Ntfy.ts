import type { Author } from "../../books/models.js";
import type { ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { INtfyProxy } from "./NtfyProxy.js";
import type { NtfySettings } from "./NtfySettings.js";

/**
 * Ported from NzbDrone.Core/Notifications/Ntfy/Ntfy.cs.
 *
 * Overrides: OnGrab, OnReleaseImport, OnAuthorAdded, OnAuthorDelete,
 * OnBookDelete, OnBookFileDelete, OnHealthIssue, OnApplicationUpdate. NOT
 * overridden: OnRename, OnDownloadFailure, OnImportFailure, OnBookRetag.
 *
 * PRESERVED C# QUIRK: titles are inconsistently branded per event --
 * Grab/Downloaded/Health/ApplicationUpdate use the `_BRANDED` constant,
 * AuthorAdded/AuthorDeleted/BookDeleted/BookFileDeleted use the bare
 * (unbranded) constant. Ported verbatim, not harmonized.
 */
export class Ntfy extends NotificationBase<NtfySettings> {
  readonly name = "ntfy.sh";
  readonly link = "https://ntfy.sh/";
  readonly configContract = "NtfySettings";

  constructor(private readonly proxy: INtfyProxy) {
    super();
  }

  override async onGrab(grabMessage: GrabMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_GRABBED_TITLE_BRANDED,
      grabMessage.message,
      this.settings
    );
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_DOWNLOADED_TITLE_BRANDED,
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
      NotificationBase.HEALTH_ISSUE_TITLE_BRANDED,
      healthCheck.message,
      this.settings
    );
  }

  override async onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.APPLICATION_UPDATE_TITLE_BRANDED,
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
