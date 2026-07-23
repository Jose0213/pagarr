import { dirname } from "node:path";
import type { Book } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { BookRetagMessage } from "../BookRetagMessage.js";
import { NotificationBase } from "../NotificationBase.js";
import type { BookFile } from "../../media-files-import/bookFile.js";
import { KavitaException } from "./KavitaException.js";
import type { IKavitaService } from "./KavitaService.js";
import type { KavitaSettings } from "./KavitaSettings.js";

/** Minimal logger surface Kavita needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface KavitaLogger {
  debug(message: string, ...args: unknown[]): void;
}

/** See notifications/synology/SynologyIndexer.ts's doc comment for why `Book.BookFiles` needs this narrow augmentation. */
type BookWithFiles = Book & { bookFiles?: BookFile[] };

/**
 * Ported from NzbDrone.Core/Notifications/Kavita/Kavita.cs.
 *
 * `Directory.GetParent(path)?.FullName` (used to derive the folder to scan
 * from a file path) is ported via Node's `path.dirname`, which is the direct
 * structural equivalent (string-only, no filesystem access) -- `.NET`'s
 * `Directory.GetParent` is also purely string-based here since it's never
 * called with `.Exists` or enumerated, only `.FullName` is read.
 *
 * The catch-all `catch (SocketException ex)` in `Notify` has the same
 * TS-has-no-SocketException gap documented in
 * `notifications/subsonic/Subsonic.ts`'s doc comment -- same catch-all
 * (excluding `KavitaException`) + debug-log-and-suppress treatment here.
 *
 * REAL C# QUIRK preserved faithfully: the log message in `Notify`'s catch
 * block reads `"Unable to connect to Subsonic Host: ..."` -- a copy-paste
 * leftover from Subsonic.cs (this notifier is Kavita, not Subsonic). Kept
 * verbatim below, not "fixed," per this port's rule to preserve real C#
 * bugs/quirks rather than silently correct them.
 */
export class Kavita extends NotificationBase<KavitaSettings> {
  readonly name = "Kavita";
  readonly configContract = "KavitaSettings";
  readonly link = "https://www.kavitareader.com/";

  constructor(
    private readonly kavitaService: IKavitaService,
    private readonly logger: KavitaLogger
  ) {
    super();
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    const allPaths = [...new Set((message.bookFiles ?? []).map((v) => v.path))];
    const path = allPaths.length > 0 ? dirname(allPaths[0]!) : undefined;
    await this.notify(this.settings, NotificationBase.BOOK_DOWNLOADED_TITLE_BRANDED, path);
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    const book = deleteMessage.book as BookWithFiles;
    const allPaths = [...new Set((book.bookFiles ?? []).map((v) => v.path))];
    const path = allPaths.length > 0 ? dirname(allPaths[0]!) : undefined;
    await this.notify(this.settings, NotificationBase.BOOK_FILE_DELETED_TITLE_BRANDED, path);
  }

  override async onBookFileDelete(message: BookFileDeleteMessage): Promise<void> {
    await this.notify(
      this.settings,
      NotificationBase.BOOK_FILE_DELETED_TITLE_BRANDED,
      dirname(message.bookFile!.path)
    );
  }

  override async onBookRetag(message: BookRetagMessage): Promise<void> {
    await this.notify(
      this.settings,
      NotificationBase.BOOK_RETAGGED_TITLE_BRANDED,
      dirname(message.bookFile!.path)
    );
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.kavitaService.test(
      this.settings,
      "Success! Kavita has been successfully configured!"
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

  private async notify(
    settings: KavitaSettings,
    header: string,
    message: string | undefined
  ): Promise<void> {
    try {
      if (this.settings.notify) {
        await this.kavitaService.notify(settings, `${header} - ${message ?? ""}`);
      }
    } catch (ex) {
      if (ex instanceof KavitaException) {
        throw ex;
      }

      // See this class's doc comment: this log message is a faithfully-preserved
      // copy-paste artifact from the real C# ("Subsonic" in a Kavita notifier).
      const logMessage = `Unable to connect to Subsonic Host: ${this.settings.host}:${this.settings.port}`;
      this.logger.debug(logMessage, ex);
    }
  }
}
