import { hostname } from "node:os";
import type { Author } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/index.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { BookRetagMessage } from "../BookRetagMessage.js";
import type { DownloadFailedMessage } from "../DownloadFailedMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import { HealthCheckResult, type HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { RenamedBookFile } from "../../media-files-organize/renamedBookFile.js";
import { DiscordException } from "./DiscordException.js";
import { DiscordColors } from "./DiscordColors.js";
import type { IDiscordProxy } from "./DiscordProxy.js";
import type { DiscordSettings } from "./DiscordSettings.js";
import type { DiscordAuthor, DiscordField, DiscordPayload, Embed } from "./payloads.js";

/**
 * Ported from NzbDrone.Core/Notifications/Discord/Discord.cs.
 *
 * PRESERVED C# QUIRKS (do not "fix" -- see this port's faithful-porting
 * rule):
 *  - `OnBookDelete`/`OnBookFileDelete` titles use a literal `$"..."` string
 *    with an escaped `${...}` inside it -- i.e. the C# source is
 *    `Title = $"{deleteMessage.Book.Author.Value.Name} - ${deleteMessage.Book.Title}"`,
 *    which renders a LITERAL "$" character before the book title (not
 *    string interpolation of a `$` variable -- the `$` sign is just part of
 *    the format string, only `Book.Title` interpolates). Ported verbatim
 *    below with the same literal "$" in the title.
 *  - `OnApplicationUpdate` passes `null` as the payload's `message`
 *    (Discord `content` field) -- CreatePayload(null, attachments) -- so the
 *    webhook message body is empty and all info lives in the embed. Ported
 *    verbatim (not defaulted to a non-null string).
 *  - `TestMessage()` uses `DateTime.Now` (local time, not UTC) unlike
 *    `OnApplicationUpdate`'s embed timestamp which uses `DateTime.UtcNow`.
 *    Both preserved as-is.
 *  - `Settings.Author` (an odd field name for what the UI labels "Host") is
 *    used as the embed author name override, falling back to the machine
 *    hostname -- ported via Node's `os.hostname()` as the `Environment.MachineName`
 *    equivalent.
 */
export class Discord extends NotificationBase<DiscordSettings> {
  private readonly proxy: IDiscordProxy;

  readonly name = "Discord";
  readonly configContract = "DiscordSettings";
  readonly link = "https://support.discordapp.com/hc/en-us/articles/228383668-Intro-to-Webhooks";

  constructor(proxy: IDiscordProxy) {
    super();
    this.proxy = proxy;
  }

  override onGrab(message: GrabMessage): Promise<void> {
    const embeds: Embed[] = [
      {
        description: message.message,
        title: message.author?.metadata?.name,
        text: message.message,
        color: DiscordColors.Warning,
      },
    ];
    const payload = this.createPayload(`Grabbed: ${message.message}`, embeds);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onReleaseImport(message: BookDownloadMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        description: message.message,
        title: message.author?.metadata?.name,
        text: message.message,
        color: DiscordColors.Success,
      },
    ];
    const payload = this.createPayload(`Imported: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onRename(author: Author, _renamedFiles: RenamedBookFile[]): Promise<void> {
    const attachments: Embed[] = [
      {
        title: author.metadata?.name,
      },
    ];

    const payload = this.createPayload("Renamed", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onAuthorAdded(author: Author): Promise<void> {
    const links = author.metadata?.links ?? [];
    const attachments: Embed[] = [
      {
        title: author.metadata?.name,
        fields: [
          {
            name: "Links",
            value: links.map((link) => `[${link.name}](${link.url})`).join(" / "),
          },
        ],
      },
    ];
    const payload = this.createPayload("Author Added", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        title: deleteMessage.author.metadata?.name,
        description: deleteMessage.deletedFilesMessage,
      },
    ];

    const payload = this.createPayload("Author Deleted", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        // Literal "$" before the title -- see class doc comment.
        title: `${deleteMessage.book?.author?.metadata?.name} - $${deleteMessage.book?.title}`,
        description: deleteMessage.deletedFilesMessage,
      },
    ];

    const payload = this.createPayload("Book Deleted", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        // Literal "$" before "... - file deleted" -- see class doc comment.
        title: `${deleteMessage.book?.author?.metadata?.name} - $${deleteMessage.book?.title} - file deleted`,
        description: deleteMessage.bookFile?.path,
      },
    ];

    const payload = this.createPayload("Book File Deleted", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    const attachments: Embed[] = [
      {
        title: healthCheck.source.name,
        text: healthCheck.message,
        color:
          healthCheck.type === HealthCheckResult.Warning
            ? DiscordColors.Warning
            : DiscordColors.Danger,
      },
    ];

    const payload = this.createPayload("Health Issue", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onBookRetag(message: BookRetagMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        title: NotificationBase.BOOK_RETAGGED_TITLE,
        text: message.message,
      },
    ];

    const payload = this.createPayload(`Track file tags updated: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onDownloadFailure(message: DownloadFailedMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        description: message.message,
        title: message.sourceTitle,
        text: message.message,
        color: DiscordColors.Danger,
      },
    ];
    const payload = this.createPayload(`Download Failed: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onImportFailure(message: BookDownloadMessage): Promise<void> {
    const attachments: Embed[] = [
      {
        description: message.message,
        title: message.book?.title ?? message.message,
        text: message.message,
        color: DiscordColors.Warning,
      },
    ];
    const payload = this.createPayload(`Import Failed: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    const authorField: DiscordAuthor = {
      name: this.settings.author?.trim() ? this.settings.author : hostname(),
      icon_url: "https://raw.githubusercontent.com/Readarr/Readarr/develop/Logo/256.png",
    };

    const fields: DiscordField[] = [
      { name: "Previous Version", value: updateMessage.previousVersion },
      { name: "New Version", value: updateMessage.newVersion },
    ];

    const attachments: Embed[] = [
      {
        author: authorField,
        title: "Application Updated",
        // C#: DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") -- exactly
        // matches Date#toISOString()'s format (ms to 3 digits, "Z" suffix).
        timestamp: new Date().toISOString(),
        color: DiscordColors.Standard,
        fields,
      },
    ];

    // C# passes null for `message` here -- Discord `content` stays empty.
    const payload = this.createPayload(null, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.testMessage();
    if (failure !== null) {
      failures.push(failure);
    }

    return {
      isValid: failures.length === 0,
      hasWarnings: false,
      errors: failures,
    };
  }

  async testMessage(): Promise<ValidationFailure | null> {
    try {
      const message = `Test message from Readarr posted at ${new Date().toString()}`;
      const payload = this.createPayload(message);

      await this.proxy.sendPayload(payload, this.settings);
    } catch (ex) {
      if (ex instanceof DiscordException) {
        return { propertyName: "Unable to post", errorMessage: ex.message };
      }

      throw ex;
    }

    return null;
  }

  private createPayload(message: string | null, embeds?: Embed[]): DiscordPayload {
    const avatar = this.settings.avatar;

    const payload: DiscordPayload = {
      username: this.settings.username,
      content: message,
      embeds,
    };

    if (avatar && avatar.trim() !== "") {
      payload.avatar_url = avatar;
    }

    if (this.settings.username && this.settings.username.trim() !== "") {
      payload.username = this.settings.username;
    }

    return payload;
  }
}
