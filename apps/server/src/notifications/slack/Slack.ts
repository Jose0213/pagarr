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
import { SlackExeption } from "./SlackException.js";
import type { ISlackProxy } from "./SlackProxy.js";
import type { SlackSettings } from "./SlackSettings.js";
import type { Attachment, SlackPayload } from "./payloads.js";

/**
 * Ported from NzbDrone.Core/Notifications/Slack/Slack.cs.
 *
 * PRESERVED C# QUIRKS (do not "fix"):
 *  - `OnBookDelete`/`OnBookFileDelete` titles use a literal `$"..."` string
 *    with TWO escaped `${...}` markers -- the real C# is
 *    `Title = $"${deleteMessage.Book.Author.Value.Name} - ${deleteMessage.Book.Title}"`.
 *    Only `Book.Author.Value.Name` and `Book.Title` interpolate; BOTH are
 *    preceded by a literal "$" sign in the rendered string (e.g.
 *    `$John Smith - $My Book`). This is a distinct quirk from
 *    `discord/Discord.ts`'s equivalent handler, which only has the leading
 *    "$" on the book-title side, not the author side -- Slack.cs and
 *    Discord.cs independently have slightly different copy-paste typos
 *    here in the real source. Ported verbatim, not harmonized between the
 *    two notifiers.
 *  - `OnImportFailure`'s attachment omits `Title` entirely (unlike Discord's,
 *    which sets `Title = message.Book?.Title ?? message.Message`) -- ported
 *    verbatim, `title` is left undefined for this handler.
 *  - `OnBookRetag`'s outer payload message is `BOOK_RETAGGED_TITLE` itself
 *    (not `$"Track file tags updated: {message.Message}"` like Discord's
 *    equivalent) -- ported verbatim.
 *  - `OnApplicationUpdate` always uses `Environment.MachineName` for the
 *    attachment title -- unlike Discord, Slack's settings have no
 *    "Author"/host-override field to check first.
 */
export class Slack extends NotificationBase<SlackSettings> {
  private readonly proxy: ISlackProxy;

  readonly name = "Slack";
  readonly configContract = "SlackSettings";
  readonly link = "https://my.slack.com/services/new/incoming-webhook/";

  constructor(proxy: ISlackProxy) {
    super();
    this.proxy = proxy;
  }

  override onGrab(message: GrabMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        fallback: message.message,
        title: message.author?.metadata?.name,
        text: message.message,
        color: "warning",
      },
    ];
    const payload = this.createPayload(`Grabbed: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onReleaseImport(message: BookDownloadMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        fallback: message.message,
        title: message.author?.metadata?.name,
        text: message.message,
        color: "good",
      },
    ];
    const payload = this.createPayload(`Imported: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onRename(author: Author, _renamedFiles: RenamedBookFile[]): Promise<void> {
    const attachments: Attachment[] = [{ title: author.metadata?.name }];

    const payload = this.createPayload("Renamed", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onAuthorAdded(author: Author): Promise<void> {
    const attachments: Attachment[] = [{ title: author.metadata?.name }];

    const payload = this.createPayload("Author Added", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        title: deleteMessage.author.metadata?.name,
        text: deleteMessage.deletedFilesMessage,
      },
    ];

    const payload = this.createPayload("Author Deleted", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        // Literal "$" before BOTH the author name and the book title -- see class doc comment.
        title: `$${deleteMessage.book?.author?.metadata?.name} - $${deleteMessage.book?.title}`,
        text: deleteMessage.deletedFilesMessage,
      },
    ];

    const payload = this.createPayload("Book Deleted", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        // Literal "$" before BOTH the author name and the book title -- see class doc comment.
        title: `$${deleteMessage.book?.author?.metadata?.name} - $${deleteMessage.book?.title} - file deleted`,
        text: deleteMessage.bookFile?.path,
      },
    ];

    const payload = this.createPayload("Book File Deleted", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    const attachments: Attachment[] = [
      {
        title: healthCheck.source.name,
        text: healthCheck.message,
        color: healthCheck.type === HealthCheckResult.Warning ? "warning" : "danger",
      },
    ];

    const payload = this.createPayload("Health Issue", attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onBookRetag(message: BookRetagMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        title: NotificationBase.BOOK_RETAGGED_TITLE,
        text: message.message,
      },
    ];

    const payload = this.createPayload(NotificationBase.BOOK_RETAGGED_TITLE, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onDownloadFailure(message: DownloadFailedMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        fallback: message.message,
        title: message.sourceTitle,
        text: message.message,
        color: "danger",
      },
    ];
    const payload = this.createPayload(`Download Failed: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onImportFailure(message: BookDownloadMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        fallback: message.message,
        text: message.message,
        color: "warning",
      },
    ];
    const payload = this.createPayload(`Import Failed: ${message.message}`, attachments);

    return this.proxy.sendPayload(payload, this.settings);
  }

  override onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    const attachments: Attachment[] = [
      {
        title: hostname(),
        text: updateMessage.message,
        color: "good",
      },
    ];

    const payload = this.createPayload("Application Updated", attachments);

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
      if (ex instanceof SlackExeption) {
        return { propertyName: "Unable to post", errorMessage: ex.message };
      }

      throw ex;
    }

    return null;
  }

  private createPayload(message: string | null, attachments?: Attachment[]): SlackPayload {
    const icon = this.settings.icon;
    const channel = this.settings.channel;

    const payload: SlackPayload = {
      username: this.settings.username,
      text: message,
      attachments,
    };

    if (icon && icon.trim() !== "") {
      // Ported from Slack.cs's icon-kind detection: emoji shorthand (":smile:")
      // vs. a URL, distinguished purely by leading/trailing colon.
      if (icon.startsWith(":") && icon.endsWith(":")) {
        payload.icon_emoji = icon;
      } else {
        payload.icon_url = icon;
      }
    }

    if (channel && channel.trim() !== "") {
      payload.channel = channel;
    }

    return payload;
  }
}
