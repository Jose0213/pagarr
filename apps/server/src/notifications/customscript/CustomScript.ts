import type { Author, Book } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { IProcessProvider, ProcessOutput } from "../ProcessProvider.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { BookRetagMessage } from "../BookRetagMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { RenamedBookFile } from "../../media-files-organize/renamedBookFile.js";
import type { CustomScriptSettings } from "./CustomScriptSettings.js";

/** Minimal slice of `IDiskProvider` this notifier's `Test()` needs: `FileExists`. Narrowed the same way `root-folders/disk-provider.ts` and `media-files-organize/diskProvider.ts` each independently narrow the same real C# interface to just what their own module calls -- see either file's doc comment for the "two disjoint partial ports of the same interface" precedent this follows. */
export interface DiskProviderLike {
  fileExists(path: string): boolean;
}

/** Minimal logger surface CustomScript needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface CustomScriptLogger {
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Ported from NzbDrone.Core/Notifications/CustomScript/CustomScript.cs.
 *
 * Every `Environment.Xxx` env var this notifier sets is prefixed
 * `Readarr_...` in the real C#; kept verbatim (NOT renamed to `Pagarr_...`)
 * since these are a documented, external contract real user scripts key off
 * of -- renaming the prefix would silently break every existing Readarr
 * custom-script integration a user migrates over. This is a deliberate
 * exception to this port's usual "Readarr -> Pagarr" branding substitution
 * (used e.g. in the `*_TITLE_BRANDED` notification-title constants), scoped
 * specifically to this externally-observable env var contract.
 *
 * `remoteBook.Books.Select(x => x.Editions.Value.Single(e => e.Monitored))`
 * (`Readarr_Release_GRIds`) and the several `.Editions.Value.Single(e =>
 * e.Monitored)` lookups elsewhere in this class throw
 * (`InvalidOperationException`) if a book has zero or more than one
 * monitored edition -- ported as genuine throws here too, matching
 * `notifications/webhook/WebhookModels.ts`'s `webhookBookFromBook` (same
 * invariant, same faithful-throw treatment, see that function's doc
 * comment).
 */
export class CustomScript extends NotificationBase<CustomScriptSettings> {
  readonly name = "Custom Script";
  readonly configContract = "CustomScriptSettings";
  readonly link = "https://wiki.servarr.com/readarr/settings#connections";

  constructor(
    private readonly diskProvider: DiskProviderLike,
    private readonly processProvider: IProcessProvider,
    private readonly logger: CustomScriptLogger
  ) {
    super();
  }

  override async onGrab(message: GrabMessage): Promise<void> {
    const author = message.author!;
    const remoteBook = message.remoteBook!;
    const parsedBookInfo = remoteBook.parsedBookInfo!;
    const release = remoteBook.release!;
    const releaseGroup = parsedBookInfo.releaseGroup;
    const quality = parsedBookInfo.quality!;
    const env: Record<string, string> = {};

    env.Readarr_EventType = "Grab";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_GRId = author.metadata?.foreignAuthorId ?? "";
    env.Readarr_Release_BookCount = String(remoteBook.books.length);
    env.Readarr_Release_BookReleaseDates = remoteBook.books
      .map((e) => e.releaseDate ?? "")
      .join(",");
    env.Readarr_Release_BookTitles = remoteBook.books.map((e) => e.title).join("|");
    env.Readarr_Release_BookIds = remoteBook.books.map((e) => String(e.id)).join("|");
    env.Readarr_Release_GRIds = remoteBook.books
      .map((x) => singleMonitoredEdition(x).foreignEditionId)
      .join("|");
    env.Readarr_Release_Title = release.title ?? "";
    env.Readarr_Release_Indexer = release.indexer ?? "";
    env.Readarr_Release_Size = String(release.size);
    env.Readarr_Release_Quality = quality.quality.name;
    env.Readarr_Release_QualityVersion = String(quality.revision.version);
    env.Readarr_Release_ReleaseGroup = releaseGroup ?? "";
    env.Readarr_Release_IndexerFlags = String(release.indexerFlags);
    env.Readarr_Download_Client = message.downloadClientName ?? "";
    env.Readarr_Download_Client_Type = message.downloadClientType ?? "";
    env.Readarr_Download_Id = message.downloadId ?? "";

    await this.executeScript(env);
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    const author = message.author!;
    const book = message.book!;
    const bookFiles = message.bookFiles ?? [];
    const oldFiles = message.oldFiles ?? [];
    const env: Record<string, string> = {};

    env.Readarr_EventType = "Download";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_Path = author.path;
    env.Readarr_Author_GRId = author.metadata?.foreignAuthorId ?? "";
    env.Readarr_Book_Id = String(book.id);
    env.Readarr_Book_Title = book.title;
    env.Readarr_Book_GRId = singleMonitoredEdition(book).foreignEditionId;
    env.Readarr_Book_ReleaseDate = book.releaseDate ?? "";
    env.Readarr_Download_Client = message.downloadClientInfo?.name ?? "";
    env.Readarr_Download_Client_Type = message.downloadClientInfo?.type ?? "";
    env.Readarr_Download_Id = message.downloadId ?? "";

    if (bookFiles.length > 0) {
      env.Readarr_AddedBookPaths = bookFiles.map((e) => e.path).join("|");
    }

    if (oldFiles.length > 0) {
      env.Readarr_DeletedPaths = oldFiles.map((e) => e.path).join("|");
      env.Readarr_DeletedDateAdded = oldFiles.map((e) => e.dateAdded).join("|");
    }

    await this.executeScript(env);
  }

  override async onRename(author: Author, _renamedFiles: RenamedBookFile[]): Promise<void> {
    const env: Record<string, string> = {};

    env.Readarr_EventType = "Rename";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_Path = author.path;
    env.Readarr_Author_GRId = author.metadata?.foreignAuthorId ?? "";

    await this.executeScript(env);
  }

  override async onAuthorAdded(author: Author): Promise<void> {
    const env: Record<string, string> = {};

    env.Readarr_EventType = "AuthorAdded";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_Path = author.path;
    env.Readarr_Author_GRId = author.metadata?.foreignAuthorId ?? "";

    await this.executeScript(env);
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    const author = deleteMessage.author;
    const env: Record<string, string> = {};

    env.Readarr_EventType = "AuthorDelete";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_Path = author.path;
    env.Readarr_Author_GoodreadsId = author.metadata?.foreignAuthorId ?? "";
    env.Readarr_Author_DeletedFiles = String(deleteMessage.deletedFiles);

    await this.executeScript(env);
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    const book = deleteMessage.book;
    const author = book.author!;

    const env: Record<string, string> = {};

    env.Readarr_EventType = "BookDelete";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_Path = author.path;
    env.Readarr_Author_GoodreadsId = author.metadata?.foreignAuthorId ?? "";
    env.Readarr_Book_Id = String(book.id);
    env.Readarr_Book_Title = book.title;
    env.Readarr_Book_GoodreadsId = book.foreignBookId;
    env.Readarr_Book_DeletedFiles = String(deleteMessage.deletedFiles);

    await this.executeScript(env);
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    const book = deleteMessage.book!;
    const author = book.author!;
    const bookFile = deleteMessage.bookFile!;
    const edition = bookFile.edition!;

    const env: Record<string, string> = {};

    env.Readarr_EventType = "BookFileDelete";
    env.Readarr_Delete_Reason = deleteMessage.reason;
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_GoodreadsId = author.metadata?.foreignAuthorId ?? "";
    env.Readarr_Book_Id = String(book.id);
    env.Readarr_Book_Title = book.title;
    env.Readarr_Book_GoodreadsId = book.foreignBookId;
    env.Readarr_BookFile_Id = String(bookFile.id);
    env.Readarr_BookFile_Path = bookFile.path;
    env.Readarr_BookFile_Quality = bookFile.quality.quality.name;
    env.Readarr_BookFile_QualityVersion = String(bookFile.quality.revision.version);
    env.Readarr_BookFile_ReleaseGroup = bookFile.releaseGroup ?? "";
    env.Readarr_BookFile_SceneName = bookFile.sceneName ?? "";
    env.Readarr_BookFile_Edition_Id = String(edition.id);
    env.Readarr_BookFile_Edition_Name = edition.title;
    env.Readarr_BookFile_Edition_GoodreadsId = edition.foreignEditionId;
    env.Readarr_BookFile_Edition_Isbn13 = edition.isbn13 ?? "";
    env.Readarr_BookFile_Edition_Asin = edition.asin ?? "";

    await this.executeScript(env);
  }

  override async onBookRetag(message: BookRetagMessage): Promise<void> {
    const author = message.author!;
    const book = message.book!;
    const bookFile = message.bookFile!;
    const env: Record<string, string> = {};

    env.Readarr_EventType = "TrackRetag";
    env.Readarr_Author_Id = String(author.id);
    env.Readarr_Author_Name = author.metadata?.name ?? "";
    env.Readarr_Author_Path = author.path;
    env.Readarr_Author_GRId = author.metadata?.foreignAuthorId ?? "";
    env.Readarr_Book_Id = String(book.id);
    env.Readarr_Book_Title = book.title;
    env.Readarr_Book_GRId = singleMonitoredEdition(book).foreignEditionId;
    env.Readarr_Book_ReleaseDate = book.releaseDate ?? "";
    env.Readarr_BookFile_Id = String(bookFile.id);
    env.Readarr_BookFile_Path = bookFile.path;
    env.Readarr_BookFile_Quality = bookFile.quality.quality.name;
    env.Readarr_BookFile_QualityVersion = String(bookFile.quality.revision.version);
    env.Readarr_BookFile_ReleaseGroup = bookFile.releaseGroup ?? "";
    env.Readarr_BookFile_SceneName = bookFile.sceneName ?? "";
    env.Readarr_Tags_Diff = JSON.stringify(message.diff);
    env.Readarr_Tags_Scrubbed = String(message.scrubbed);

    await this.executeScript(env);
  }

  override async onHealthIssue(healthCheck: HealthCheckLike): Promise<void> {
    const env: Record<string, string> = {};

    env.Readarr_EventType = "HealthIssue";
    env.Readarr_Health_Issue_Level = HealthCheckResultName[healthCheck.type] ?? "";
    env.Readarr_Health_Issue_Message = healthCheck.message;
    env.Readarr_Health_Issue_Type = healthCheck.source.name;
    env.Readarr_Health_Issue_Wiki = healthCheck.wikiUrl ?? "";

    await this.executeScript(env);
  }

  override async onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> {
    const env: Record<string, string> = {};

    env.Readarr_EventType = "ApplicationUpdate";
    env.Readarr_Update_Message = updateMessage.message;
    env.Readarr_Update_NewVersion = updateMessage.newVersion;
    env.Readarr_Update_PreviousVersion = updateMessage.previousVersion;

    await this.executeScript(env);
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    if (!this.diskProvider.fileExists(this.settings.path)) {
      failures.push({ propertyName: "Path", errorMessage: "File does not exist" });
    }

    if (failures.length === 0) {
      try {
        const env: Record<string, string> = { Readarr_EventType: "Test" };

        const processOutput = await this.executeScript(env);

        if (processOutput.exitCode !== 0) {
          failures.push({
            propertyName: "",
            errorMessage: `Script exited with code: ${processOutput.exitCode}`,
          });
        }
      } catch (ex) {
        this.logger.error("CustomScript test failed", ex);
        failures.push({
          propertyName: "",
          errorMessage: ex instanceof Error ? ex.message : String(ex),
        });
      }
    }

    return {
      isValid: !failures.some((f) => !f.isWarning),
      hasWarnings: failures.some((f) => !!f.isWarning),
      errors: failures,
    };
  }

  private async executeScript(
    environmentVariables: Record<string, string>
  ): Promise<ProcessOutput> {
    this.logger.debug("Executing external script: %s", this.settings.path);

    const processOutput = await this.processProvider.startAndCapture(
      this.settings.path,
      this.settings.arguments,
      environmentVariables
    );

    this.logger.debug(
      "Executed external script: %s - Status: %d",
      this.settings.path,
      processOutput.exitCode
    );
    this.logger.debug(`Script Output:\n${processOutput.lines.map((l) => l.content).join("\n")}`);

    return processOutput;
  }
}

/** Ported from `Enum.GetName(typeof(HealthCheckResult), healthCheck.Type)` -- maps the numeric HealthCheckResult back to its C# member name. */
const HealthCheckResultName: Record<number, string> = {
  0: "Ok",
  1: "Notice",
  2: "Warning",
  3: "Error",
};

/** Ported from the repeated `book.Editions.Value.Single(e => e.Monitored)` LINQ call -- see this class's doc comment on why this throws rather than silently defaulting. */
function singleMonitoredEdition(book: Book): { foreignEditionId: string } {
  const editions = (book.editions ?? []).filter((e) => e.monitored);

  if (editions.length !== 1) {
    throw new Error(
      `Sequence contains ${editions.length === 0 ? "no" : "more than one"} matching element`
    );
  }

  return editions[0]!;
}
