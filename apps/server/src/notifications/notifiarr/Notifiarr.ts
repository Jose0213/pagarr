import type { Author } from "../../books/models.js";
import type { ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { WebhookBase, type ConfigFileProviderLike } from "../webhook/WebhookBase.js";
import type { INotifiarrProxy } from "./NotifiarrProxy.js";
import { NotifiarrException } from "./NotifiarrException.js";
import type { NotifiarrSettings } from "./NotifiarrSettings.js";

/**
 * Ported from NzbDrone.Core/Notifications/Notifiarr/Notifiarr.cs.
 *
 * `extends WebhookBase<NotifiarrSettings>` -- a genuine, load-bearing
 * dependency on the REAL, already-reconciled `notifications/webhook/
 * WebhookBase.ts` (Notifiarr.cs really does extend the same
 * `WebhookBase<TSettings>` Webhook.cs extends in the real C# source; this
 * worktree's own narrow forward-ref slice of WebhookBase -- built before
 * the real Webhook module existed here -- was deleted at merge-time
 * reconciliation once `port/notifications-media` (which owns the real,
 * full Webhook port) landed, per this integration branch's merge-order
 * plan). The real WebhookBase's `buildOnX` methods resolve author/book/
 * release themselves from the message, so this class no longer needs the
 * narrow slice's `toWebhookAuthor`/`toWebhookBook`/`toWebhookBookFile`
 * pre-resolution helpers -- it just forwards the message straight through,
 * matching Webhook.ts's own (already-reconciled) call pattern.
 *
 * Overrides: OnGrab, OnReleaseImport, OnAuthorAdded, OnAuthorDelete,
 * OnBookDelete, OnBookFileDelete, OnHealthIssue, OnApplicationUpdate --
 * matches the real C# exactly (NOT OnRename/OnDownloadFailure/
 * OnImportFailure/OnBookRetag).
 */
export class Notifiarr extends WebhookBase<NotifiarrSettings> {
  readonly link = "https://notifiarr.com";
  readonly name = "Notifiarr";
  readonly configContract = "NotifiarrSettings";

  constructor(
    private readonly proxy: INotifiarrProxy,
    configFileProvider: ConfigFileProviderLike
  ) {
    super(configFileProvider);
  }

  override async onGrab(message: GrabMessage): Promise<void> {
    await this.proxy.sendNotification(this.buildOnGrabPayload(message), this.settings);
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    await this.proxy.sendNotification(this.buildOnReleaseImportPayload(message), this.settings);
  }

  override async onAuthorAdded(author: Author): Promise<void> {
    await this.proxy.sendNotification(this.buildOnAuthorAdded(author), this.settings);
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(this.buildOnAuthorDelete(deleteMessage), this.settings);
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(this.buildOnBookDelete(deleteMessage), this.settings);
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    await this.proxy.sendNotification(this.buildOnBookFileDelete(deleteMessage), this.settings);
  }

  override async onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    await this.proxy.sendNotification(this.buildHealthPayload(healthCheck), this.settings);
  }

  override async onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    await this.proxy.sendNotification(
      this.buildApplicationUpdatePayload(updateMessage),
      this.settings
    );
  }

  async test(): Promise<ValidationResult> {
    const failure = await this.sendWebhookTest();
    const errors = failure ? [failure] : [];

    return {
      isValid: errors.length === 0,
      hasWarnings: false,
      errors,
    };
  }

  private async sendWebhookTest(): Promise<{ propertyName: string; errorMessage: string } | null> {
    try {
      await this.proxy.sendNotification(this.buildTestPayload(), this.settings);
    } catch (ex) {
      if (ex instanceof NotifiarrException) {
        return { propertyName: "APIKey", errorMessage: ex.message };
      }
      throw ex;
    }

    return null;
  }
}
