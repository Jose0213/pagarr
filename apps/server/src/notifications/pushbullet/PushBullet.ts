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
import type { IPushBulletProxy } from "./PushBulletProxy.js";
import type { PushBulletSettings } from "./PushBulletSettings.js";

/**
 * Ported from NzbDrone.Core/Notifications/PushBullet/PushBullet.cs.
 *
 * Overrides: OnGrab, OnReleaseImport, OnAuthorAdded, OnAuthorDelete,
 * OnBookDelete, OnBookFileDelete, OnHealthIssue, OnDownloadFailure,
 * OnImportFailure, OnApplicationUpdate, RequestAction. NOT overridden:
 * OnRename, OnBookRetag.
 */
export class PushBullet extends NotificationBase<PushBulletSettings> {
  readonly name = "Pushbullet";
  readonly link = "https://www.pushbullet.com/";
  readonly configContract = "PushBulletSettings";

  constructor(private readonly proxy: IPushBulletProxy) {
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

  override async onDownloadFailure(message: DownloadFailedMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.DOWNLOAD_FAILURE_TITLE_BRANDED,
      message.message,
      this.settings
    );
  }

  override async onImportFailure(message: BookDownloadMessage): Promise<void> {
    await this.proxy.sendNotification(
      NotificationBase.IMPORT_FAILURE_TITLE_BRANDED,
      message.message,
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

  /**
   * Ported from `PushBullet.RequestAction(string action, IDictionary<string,
   * string> query)`: the `"getDevices"` action returns early with an empty
   * device list if no API key is set (no `validate().filter("ApiKey")
   * .throwOnError()` call in that branch either), otherwise validates just
   * the ApiKey field and throws on failure before fetching + sorting real
   * devices by nickname (case-insensitive).
   */
  override requestAction(action: string, _query: Record<string, string>): unknown {
    if (action === "getDevices") {
      if (!this.settings.apiKey || this.settings.apiKey.trim() === "") {
        return { devices: [] };
      }

      const validation = this.settings.validate();
      const apiKeyErrors = validation.errors.filter((e) => e.propertyName === "ApiKey");
      if (apiKeyErrors.length > 0) {
        throw new Error(apiKeyErrors.map((e) => e.errorMessage).join(", "));
      }

      return this.proxy.getDevices(this.settings).then((devices) => ({
        options: devices
          .filter((d) => d.nickname && d.nickname.trim() !== "")
          .sort((a, b) =>
            (a.nickname ?? "").localeCompare(b.nickname ?? "", undefined, {
              sensitivity: "base",
            })
          )
          .map((d) => ({ id: d.iden, name: d.nickname })),
      }));
    }

    return {};
  }
}

function authorName(author: Author): string {
  return author.metadata?.name ?? "";
}
