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
import type { IJoinProxy } from "./JoinProxy.js";
import type { JoinSettings } from "./JoinSettings.js";

/**
 * Ported from NzbDrone.Core/Notifications/Join/Join.cs.
 */
export class Join extends NotificationBase<JoinSettings> {
  readonly name = "Join";
  readonly link = "https://joaoapps.com/join/";
  readonly configContract = "JoinSettings";

  constructor(private readonly proxy: IJoinProxy) {
    super();
  }

  override async onGrab(message: GrabMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_GRABBED_TITLE_BRANDED,
      message.message,
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
      NotificationBase.AUTHOR_ADDED_TITLE_BRANDED,
      authorName(author),
      this.settings
    );
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(
      // NB: real base's constant name has a preserved typo (`TITlE`, lowercase L) -- see NotificationBase.ts.
      NotificationBase.AUTHOR_DELETED_TITlE_BRANDED,
      deleteMessage.message,
      this.settings
    );
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_DELETED_TITLE_BRANDED,
      deleteMessage.message,
      this.settings
    );
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.BOOK_FILE_DELETED_TITLE_BRANDED,
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

/** `author.Name` compatibility property (Metadata.Value.Name passthrough) has no direct equivalent -- see books/models.ts's doc comment; resolved here from the optional `metadata` relation the same way every other ported call site does. */
function authorName(author: Author): string {
  return author.metadata?.name ?? "";
}
