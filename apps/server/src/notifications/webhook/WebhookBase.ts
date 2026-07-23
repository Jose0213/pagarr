import type { Author } from "../../books/models.js";
import type { IProviderConfig } from "../../thingi-provider/IProviderConfig.js";
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
import { WebhookEventType } from "./WebhookEventType.js";
import {
  webhookAuthorFromAuthor,
  webhookBookFileFromBookFile,
  webhookBookFromBook,
  webhookReleaseFromRemoteBook,
  webhookRenamedBookFileFromRenamedBookFile,
  newWebhookAuthor,
} from "./WebhookModels.js";
import type {
  WebhookApplicationUpdatePayload,
  WebhookAuthorAddedPayload,
  WebhookAuthorDeletePayload,
  WebhookBookDeletePayload,
  WebhookBookFileDeletePayload,
  WebhookGrabPayload,
  WebhookHealthPayload,
  WebhookImportPayload,
  WebhookPayload,
  WebhookRenamePayload,
  WebhookRetagPayload,
} from "./WebhookPayloads.js";

/** Minimal slice of `IConfigFileProvider` WebhookBase needs: `InstanceName`. */
export interface ConfigFileProviderLike {
  readonly instanceName: string;
}

/**
 * Ported from NzbDrone.Core/Notifications/Webhook/WebhookBase.cs
 * (`abstract class WebhookBase<TSettings> : NotificationBase<TSettings>`).
 * Every `BuildOnX` method is a direct, allocation-only payload builder with
 * no branching beyond what's shown below -- ported 1:1.
 */
export abstract class WebhookBase<
  TSettings extends IProviderConfig,
> extends NotificationBase<TSettings> {
  protected constructor(protected readonly configFileProvider: ConfigFileProviderLike) {
    super();
  }

  buildOnGrabPayload(message: GrabMessage): WebhookGrabPayload {
    const remoteBook = message.remoteBook!;
    const quality = message.quality!;

    return {
      eventType: WebhookEventType.Grab,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(message.author!),
      books: remoteBook.books.map((x) => webhookBookFromBook(x)),
      release: webhookReleaseFromRemoteBook(quality, remoteBook),
      downloadClient: message.downloadClientName,
      downloadClientType: message.downloadClientType,
      downloadId: message.downloadId,
    };
  }

  buildOnReleaseImportPayload(message: BookDownloadMessage): WebhookImportPayload {
    const bookFiles = message.bookFiles ?? [];
    const oldFiles = message.oldFiles ?? [];

    const payload: WebhookImportPayload = {
      eventType: WebhookEventType.Download,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(message.author!),
      book: webhookBookFromBook(message.book!),
      bookFiles: bookFiles.map((x) => webhookBookFileFromBookFile(x)),
      deletedFiles: null,
      isUpgrade: oldFiles.length > 0,
      downloadClient: message.downloadClientInfo?.name ?? null,
      downloadClientType: message.downloadClientInfo?.type ?? null,
      downloadId: message.downloadId,
    };

    if (oldFiles.length > 0) {
      payload.deletedFiles = oldFiles.map((x) => webhookBookFileFromBookFile(x));
    }

    return payload;
  }

  buildOnRenamePayload(author: Author, renamedFiles: RenamedBookFile[]): WebhookRenamePayload {
    return {
      eventType: WebhookEventType.Rename,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(author),
      renamedBookFiles: renamedFiles.map((x) => webhookRenamedBookFileFromRenamedBookFile(x)),
    };
  }

  buildOnBookRetagPayload(message: BookRetagMessage): WebhookRetagPayload {
    return {
      eventType: WebhookEventType.Retag,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(message.author!),
      bookFile: webhookBookFileFromBookFile(message.bookFile!),
    };
  }

  /**
   * Ported from `new WebhookAuthor(deleteMessage.Book.Author)`: `Book.Author`
   * is `LazyLoaded<Author>` in C#, implicitly unwrapped to `Author` via
   * `LazyLoaded<T>`'s implicit conversion operator (see
   * NzbDrone.Core/Datastore/LazyLoaded.cs) wherever an `Author` is expected.
   * This port's `books/models.ts` already models every lazy-loaded relation
   * (including `Book.author`) as a plain optional field rather than a lazy
   * wrapper -- see that file's module doc comment -- so `deleteMessage.book.author`
   * here is the direct equivalent, no unwrapping needed.
   */
  buildOnBookDelete(deleteMessage: BookDeleteMessage): WebhookBookDeletePayload {
    const book = deleteMessage.book;

    return {
      eventType: WebhookEventType.BookDelete,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(book.author!),
      book: webhookBookFromBook(book),
      deletedFiles: deleteMessage.deletedFiles,
    };
  }

  buildOnBookFileDelete(deleteMessage: BookFileDeleteMessage): WebhookBookFileDeletePayload {
    const book = deleteMessage.book!;

    return {
      eventType: WebhookEventType.BookFileDelete,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(book.author!),
      book: webhookBookFromBook(book),
      bookFile: webhookBookFileFromBookFile(deleteMessage.bookFile!),
    };
  }

  buildOnAuthorAdded(author: Author): WebhookAuthorAddedPayload {
    return {
      eventType: WebhookEventType.AuthorAdded,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(author),
    };
  }

  buildOnAuthorDelete(deleteMessage: AuthorDeleteMessage): WebhookAuthorDeletePayload {
    return {
      eventType: WebhookEventType.AuthorDelete,
      instanceName: this.configFileProvider.instanceName,
      author: webhookAuthorFromAuthor(deleteMessage.author),
      deletedFiles: deleteMessage.deletedFiles,
    };
  }

  protected buildHealthPayload(healthCheck: HealthCheckLike): WebhookHealthPayload {
    return {
      eventType: WebhookEventType.Health,
      instanceName: this.configFileProvider.instanceName,
      level: healthCheck.type,
      message: healthCheck.message,
      type: healthCheck.source.name,
      wikiUrl: healthCheck.wikiUrl,
    };
  }

  protected buildApplicationUpdatePayload(
    updateMessage: ApplicationUpdateMessage
  ): WebhookApplicationUpdatePayload {
    return {
      eventType: WebhookEventType.ApplicationUpdate,
      instanceName: this.configFileProvider.instanceName,
      message: updateMessage.message,
      previousVersion: updateMessage.previousVersion,
      newVersion: updateMessage.newVersion,
    };
  }

  protected buildTestPayload(): WebhookPayload {
    const payload: WebhookGrabPayload = {
      eventType: WebhookEventType.Test,
      instanceName: this.configFileProvider.instanceName,
      author: newWebhookAuthor({
        id: 1,
        name: "Test Name",
        path: "C:\\testpath",
        goodreadsId: "aaaaa-aaa-aaaa-aaaaaa",
      }),
      books: [
        {
          id: 123,
          title: "Test title",
          goodreadsId: null,
          edition: null,
          releaseDate: null,
        },
      ],
      release: {
        quality: null,
        qualityVersion: 0,
        releaseGroup: null,
        releaseTitle: null,
        indexer: null,
        size: 0,
        customFormatScore: 0,
        customFormats: null,
      },
      downloadClient: null,
      downloadClientType: null,
      downloadId: null,
    };

    return payload;
  }
}
