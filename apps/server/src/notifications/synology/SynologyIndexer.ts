import type { Author, Book } from "../../books/models.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookRetagMessage } from "../BookRetagMessage.js";
import { NotificationBase } from "../NotificationBase.js";
import type { BookFile } from "../../media-files-import/bookFile.js";
import type { RenamedBookFile } from "../../media-files-organize/renamedBookFile.js";
import type { ISynologyIndexerProxy } from "./SynologyIndexerProxy.js";
import type { SynologyIndexerSettings } from "./SynologyIndexerSettings.js";

/**
 * Forward-ref augmentation for `Book.BookFiles` (`LazyLoaded<List<BookFile>>`
 * in the real C#, read by `OnBookDelete` here) -- not present on the real,
 * already-ported `books/models.ts` `Book` interface since MediaFiles hasn't
 * landed in this worktree yet (same gap `notifications/forwardRefs.ts`'s
 * module doc comment describes for `BookFile` itself). Narrowed to just this
 * one field rather than re-declaring the whole `Book` shape.
 */
type BookWithFiles = Book & { bookFiles?: BookFile[] };

/**
 * Ported from NzbDrone.Core/Notifications/Synology/SynologyIndexer.cs.
 */
export class SynologyIndexer extends NotificationBase<SynologyIndexerSettings> {
  readonly name = "Synology Indexer";
  readonly configContract = "SynologyIndexerSettings";
  readonly link = "https://www.synology.com";

  constructor(private readonly indexerProxy: ISynologyIndexerProxy) {
    super();
  }

  override async onReleaseImport(message: BookDownloadMessage): Promise<void> {
    if (this.settings.updateLibrary) {
      for (const oldFile of message.oldFiles ?? []) {
        await this.indexerProxy.deleteFile(oldFile.path);
      }

      for (const newFile of message.bookFiles ?? []) {
        await this.indexerProxy.addFile(newFile.path);
      }
    }
  }

  override async onRename(author: Author, _renamedFiles: RenamedBookFile[]): Promise<void> {
    if (this.settings.updateLibrary) {
      await this.indexerProxy.updateFolder(author.path);
    }
  }

  override async onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> {
    if (this.settings.updateLibrary) {
      await this.indexerProxy.deleteFolder(deleteMessage.author.path);
    }
  }

  override async onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> {
    if (this.settings.updateLibrary && deleteMessage.deletedFiles) {
      const book = deleteMessage.book as BookWithFiles;
      for (const bookFile of book.bookFiles ?? []) {
        await this.indexerProxy.deleteFile(bookFile.path);
      }
    }
  }

  override async onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> {
    if (this.settings.updateLibrary) {
      await this.indexerProxy.deleteFile(deleteMessage.bookFile!.path);
    }
  }

  override async onBookRetag(message: BookRetagMessage): Promise<void> {
    if (this.settings.updateLibrary) {
      await this.indexerProxy.updateFolder(message.author!.path);
    }
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.testConnection();
    if (failure) {
      failures.push(failure);
    }

    return {
      isValid: !failures.some((f) => !f.isWarning),
      hasWarnings: failures.some((f) => !!f.isWarning),
      errors: failures,
    };
  }

  protected async testConnection(): Promise<ValidationFailure | null> {
    if (process.platform !== "linux") {
      return { propertyName: "", errorMessage: "Must be a Synology" };
    }

    if (!(await this.indexerProxy.test())) {
      return { propertyName: "", errorMessage: "Not a Synology or synoindex not available" };
    }

    return null;
  }
}
