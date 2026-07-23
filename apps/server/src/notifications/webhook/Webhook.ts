import type { Author } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { BookRetagMessage } from "../BookRetagMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import type { RenamedBookFile } from "../../media-files-organize/renamedBookFile.js";
import { WebhookBase, type ConfigFileProviderLike } from "./WebhookBase.js";
import { WebhookException } from "./WebhookException.js";
import type { IWebhookProxy } from "./WebhookProxy.js";
import type { WebhookSettings } from "./WebhookSettings.js";

/** Ported from NzbDrone.Core/Notifications/Webhook/Webhook.cs. */
export class Webhook extends WebhookBase<WebhookSettings> {
  readonly name = "Webhook";
  readonly configContract = "WebhookSettings";
  readonly link = "https://wiki.servarr.com/readarr/settings#connections";

  constructor(
    private readonly proxy: IWebhookProxy,
    configFileProvider: ConfigFileProviderLike
  ) {
    super(configFileProvider);
  }

  override async onGrab(message: GrabMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnGrabPayload(message), this.settings);
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnReleaseImportPayload(message), this.settings);
  }

  override async onRename(author: Author, renamedFiles: RenamedBookFile[]): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnRenamePayload(author, renamedFiles), this.settings);
  }

  override async onAuthorAdded(author: Author): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnAuthorAdded(author), this.settings);
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnAuthorDelete(deleteMessage), this.settings);
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnBookDelete(deleteMessage), this.settings);
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnBookFileDelete(deleteMessage), this.settings);
  }

  override async onBookRetag(message: BookRetagMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildOnBookRetagPayload(message), this.settings);
  }

  override async onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    await this.proxy.sendWebhook(this.buildHealthPayload(healthCheck), this.settings);
  }

  override async onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    await this.proxy.sendWebhook(this.buildApplicationUpdatePayload(updateMessage), this.settings);
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.sendWebhookTest();
    if (failure) {
      failures.push(failure);
    }

    return {
      isValid: !failures.some((f) => !f.isWarning),
      hasWarnings: failures.some((f) => !!f.isWarning),
      errors: failures,
    };
  }

  private async sendWebhookTest(): Promise<ValidationFailure | null> {
    try {
      await this.proxy.sendWebhook(this.buildTestPayload(), this.settings);
    } catch (ex) {
      if (ex instanceof WebhookException) {
        return { propertyName: "Url", errorMessage: ex.message };
      }

      throw ex;
    }

    return null;
  }
}
