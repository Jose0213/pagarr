import type { Author } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { BookRetagMessage } from "../BookRetagMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { RenamedBookFile } from "../../media-files-organize/renamedBookFile.js";
import { SubsonicException } from "./SubsonicException.js";
import type { ISubsonicService } from "./SubsonicService.js";
import type { SubsonicSettings } from "./SubsonicSettings.js";

/** Minimal logger surface Subsonic needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SubsonicLogger {
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Ported from NzbDrone.Core/Notifications/Subsonic/Subsonic.cs.
 *
 * `catch (SocketException ex)` in `Notify`/`Update` has no direct TS
 * equivalent (undici/fetch surfaces connection failures as generic
 * `TypeError`/`Error`, not a distinguishable socket-exception type -- same
 * gap `notifications/plex/server/PlexServerProxy.ts`'s doc comment notes for
 * `WebExceptionStatus.TrustFailure`). Ported as a catch-all `catch (ex)`
 * that excludes `SubsonicException`/`SubsonicAuthenticationException`
 * (protocol-level errors the proxy throws deliberately, which should
 * propagate, not be swallowed) -- everything else (connection refused, DNS
 * failure, timeout) is logged at debug and suppressed, matching the C#'s
 * "don't let a Subsonic host being unreachable break the notify/update
 * call" intent.
 */
export class Subsonic extends NotificationBase<SubsonicSettings> {
  readonly name = "Subsonic";
  readonly configContract = "SubsonicSettings";
  readonly link = "http://subsonic.org/";

  constructor(
    private readonly subsonicService: ISubsonicService,
    private readonly logger: SubsonicLogger
  ) {
    super();
  }

  override async onGrab(grabMessage: GrabMessage): Promise<void> {
    const header = "Readarr - Grabbed";

    await this.notify(this.settings, header, grabMessage.message);
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    const header = "Readarr - Downloaded";

    await this.notify(this.settings, header, message.message);
    await this.update();
  }

  override async onRename(_author: Author, _renamedFiles: RenamedBookFile[]): Promise<void> {
    await this.update();
  }

  override async onAuthorAdded(author: Author): Promise<void> {
    await this.notify(
      this.settings,
      NotificationBase.AUTHOR_ADDED_TITLE_BRANDED,
      author.metadata?.name ?? ""
    );
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    const header = "Readarr - Author Deleted";

    await this.notify(this.settings, header, deleteMessage.message);

    if (deleteMessage.deletedFiles) {
      await this.update();
    }
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    const header = "Readarr - Book Deleted";

    await this.notify(this.settings, header, deleteMessage.message);

    if (deleteMessage.deletedFiles) {
      await this.update();
    }
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    const header = "Readarr - Book File Deleted";

    await this.notify(this.settings, header, deleteMessage.message);
    await this.update();
  }

  override async onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    await this.notify(
      this.settings,
      NotificationBase.HEALTH_ISSUE_TITLE_BRANDED,
      healthCheck.message
    );
  }

  override async onBookRetag(message: BookRetagMessage): Promise<void> {
    await this.notify(this.settings, NotificationBase.BOOK_RETAGGED_TITLE_BRANDED, message.message);
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.subsonicService.test(
      this.settings,
      "Success! Subsonic has been successfully configured!"
    );
    if (failure) {
      failures.push(failure);
    }

    return {
      isValid: !failures.some((f) => !f.isWarning),
      hasWarnings: failures.some((f) => !!f.isWarning),
      errors: failures,
    };
  }

  private async notify(settings: SubsonicSettings, header: string, message: string): Promise<void> {
    try {
      if (this.settings.notify) {
        await this.subsonicService.notify(settings, `${header} - ${message}`);
      }
    } catch (ex) {
      if (ex instanceof SubsonicException) {
        throw ex;
      }

      const logMessage = `Unable to connect to Subsonic Host: ${this.settings.host}:${this.settings.port}`;
      this.logger.debug(logMessage, ex);
    }
  }

  private async update(): Promise<void> {
    try {
      if (this.settings.updateLibrary) {
        await this.subsonicService.update(this.settings);
      }
    } catch (ex) {
      if (ex instanceof SubsonicException) {
        throw ex;
      }

      const logMessage = `Unable to connect to Subsonic Host: ${this.settings.host}:${this.settings.port}`;
      this.logger.debug(logMessage, ex);
    }
  }
}
