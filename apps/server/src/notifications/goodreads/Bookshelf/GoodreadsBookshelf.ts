/**
 * Ported from NzbDrone.Core/Notifications/Goodreads/Bookshelf/GoodreadsBookshelf.cs.
 * See `../GoodreadsSettingsBase.ts`'s doc comment for this integration's
 * live-service (dead) status.
 */

import { XElement } from "../../../indexers/xml/XElement.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import type { AuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../../BookFileDeleteMessage.js";
import { GoodreadsNotificationBase, type GoodreadsLogger } from "../GoodreadsNotificationBase.js";
import {
  parsePaginatedList,
  parseReviewResource,
  parseUserShelfResource,
  type ReviewResource,
  type UserShelfResource,
} from "../resources.js";
import type { GoodreadsBookshelfNotificationSettings } from "./GoodreadsBookshelfNotificationSettings.js";

export class GoodreadsBookshelf extends GoodreadsNotificationBase<GoodreadsBookshelfNotificationSettings> {
  readonly name = "Goodreads Bookshelves";
  readonly configContract = "GoodreadsBookshelfNotificationSettings";
  override readonly link = "https://goodreads.com/";

  constructor(httpClient: IHttpClient, logger?: GoodreadsLogger) {
    super(httpClient, logger);
  }

  /**
   * NOTE on async/void: `INotification.OnReleaseImport` etc. are declared
   * `void` in the real C# (`NotificationService` calls them synchronously,
   * fire-and-forget from the caller's perspective). This port's HTTP client
   * is Promise-based, so each hook below is a synchronous `void` wrapper
   * that kicks off (without awaiting) an internal async implementation --
   * matching the same "fire the async work, don't block the interface"
   * shape every other notifier in this worktree uses (e.g. `email/Email.ts`'s
   * `void this.sendEmail(...)` calls).
   */
  override onReleaseImport(message: BookDownloadMessage): void {
    void this.onReleaseImportAsync(message);
  }

  private async onReleaseImportAsync(message: BookDownloadMessage): Promise<void> {
    const importedBook = message.book!;
    const authorName = importedBook.author?.metadata?.name ?? message.author?.metadata?.name ?? "";

    for (const shelf of this.settings.removeIds) {
      const listBooks = await this.searchShelf(shelf, authorName);
      const toRemove = listBooks.filter(
        (x) => x.book !== null && String(x.book.workId) === importedBook.foreignBookId
      );

      for (const listBook of toRemove) {
        if (listBook.book) {
          await this.removeBookFromShelves(listBook.book.id, shelf);
        }
      }
    }

    const monitoredEdition = (importedBook.editions ?? []).find((e) => e.monitored);
    if (monitoredEdition) {
      await this.addToShelves(monitoredEdition.foreignEditionId, this.settings.addIds);
    }
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): void {
    void this.onAuthorDeleteAsync(deleteMessage);
  }

  private async onAuthorDeleteAsync(deleteMessage: AuthorDeleteMessage): Promise<void> {
    if (!deleteMessage.deletedFiles) {
      return;
    }

    const authorBookIds = new Set((deleteMessage.author.books ?? []).map((b) => b.foreignBookId));

    for (const shelf of this.settings.removeIds) {
      const listBooks = await this.searchShelf(shelf, deleteMessage.author.metadata?.name ?? "");
      const toRemove = listBooks.filter(
        (x) => x.book !== null && authorBookIds.has(String(x.book.workId))
      );

      for (const listBook of toRemove) {
        if (listBook.book) {
          await this.removeBookFromShelves(listBook.book.id, shelf);
        }
      }
    }
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): void {
    void this.onBookDeleteAsync(deleteMessage);
  }

  private async onBookDeleteAsync(deleteMessage: BookDeleteMessage): Promise<void> {
    if (!deleteMessage.deletedFiles) {
      return;
    }

    const book = deleteMessage.book;
    const authorName = book.author?.metadata?.name ?? "";

    for (const shelf of this.settings.removeIds) {
      const listBooks = await this.searchShelf(shelf, authorName);
      const toRemove = listBooks.filter(
        (x) => x.book !== null && String(x.book.workId) === book.foreignBookId
      );

      for (const listBook of toRemove) {
        if (listBook.book) {
          await this.removeBookFromShelves(listBook.book.id, shelf);
        }
      }
    }
  }

  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): void {
    void this.onBookFileDeleteAsync(deleteMessage);
  }

  private async onBookFileDeleteAsync(deleteMessage: BookFileDeleteMessage): Promise<void> {
    const book = deleteMessage.book!;
    const authorName = book.author?.metadata?.name ?? "";

    for (const shelf of this.settings.removeIds) {
      const listBooks = await this.searchShelf(shelf, authorName);
      const toRemove = listBooks.filter(
        (x) => x.book !== null && String(x.book.workId) === book.foreignBookId
      );

      for (const listBook of toRemove) {
        if (listBook.book) {
          await this.removeBookFromShelves(listBook.book.id, shelf);
        }
      }
    }
  }

  override async requestAction(action: string, query: Record<string, string>): Promise<unknown> {
    if (action === "getBookshelves") {
      if (!this.settings.accessToken) {
        return { shelves: [] };
      }

      const validation = this.settings.validate();
      const accessTokenErrors = validation.errors.filter(
        (e) => e.propertyName === "accessToken" && !e.isWarning
      );
      if (accessTokenErrors.length > 0) {
        throw new Error(accessTokenErrors.map((e) => e.errorMessage).join(" "));
      }

      const shelves: UserShelfResource[] = [];
      let page = 0;

      while (true) {
        page += 1;
        const curr = await this.getShelfList(page);
        if (curr.length === 0) {
          break;
        }
        shelves.push(...curr);
      }

      this.logger.trace(`Name: ${query.name} ${query.name === "removeIds"}`);

      const helptext = {
        addIds: `Add imported book to ${this.settings.userName}'s shelves:`,
        removeIds: `Remove imported book from ${this.settings.userName}'s shelves:`,
      };

      return {
        options: {
          helptext,
          user: this.settings.userName,
          shelves: [...shelves]
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
            .map((p) => ({ id: p.name, name: p.name })),
        },
      };
    }

    return super.requestAction(action, query);
  }

  private async getShelfList(page: number): Promise<UserShelfResource[]> {
    try {
      const builder = this.requestBuilder()
        .setSegment("route", "shelf/list.xml")
        .addQueryParam("user_id", this.settings.userId)
        .addQueryParam("page", page);

      const httpResponse = await this.oAuthExecute(builder);

      const root = XElement.parse(httpResponse.content);
      const shelvesEl = root.element("shelves");
      if (!shelvesEl) {
        return [];
      }

      return parsePaginatedList(shelvesEl, parseUserShelfResource).list;
    } catch (ex) {
      this.logger.warn("Error fetching bookshelves from Goodreads", ex);
      return [];
    }
  }

  private async searchShelf(shelf: string, query: string): Promise<ReviewResource[]> {
    const results: ReviewResource[] = [];

    // Ported verbatim from GoodreadsBookshelf.SearchShelf's outer `while
    // (true)` loop. PRESERVED C# BUG: the original resets `var page = 1;`
    // INSIDE the outer while loop (not before it), so every iteration of
    // the outer loop always requests page 1 again -- `page++` never
    // advances past the first request within a given call, making the
    // pagination-continuation check below (`resource.Pagination.End >=
    // resource.Pagination.TotalItems`) the only thing that can end the
    // loop, and only after Goodreads returns fewer than TotalItems on
    // page 1 forever (an infinite loop in practice if TotalItems keeps
    // exceeding End). Kept faithfully rather than hoisting `page` out of
    // the loop, per this task's "preserve real C# bugs" rule.
    while (true) {
      const page = 1;

      try {
        const builder = this.requestBuilder()
          .setSegment("route", "review/list.xml")
          .addQueryParam("v", 2)
          .addQueryParam("id", this.settings.userId)
          .addQueryParam("shelf", shelf)
          .addQueryParam("per_page", 200)
          .addQueryParam("page", page)
          .addQueryParam("search[query]", query);

        const httpResponse = await this.oAuthExecute(builder);

        const root = XElement.parse(httpResponse.content);
        const reviewsEl = root.element("reviews");
        if (!reviewsEl) {
          break;
        }

        const resource = parsePaginatedList(reviewsEl, parseReviewResource);

        results.push(...resource.list);

        if (resource.pagination.end >= resource.pagination.totalItems) {
          break;
        }
      } catch (ex) {
        this.logger.warn("Error fetching bookshelves from Goodreads", ex);
        return results;
      }
    }

    return results;
  }

  private async removeBookFromShelves(bookId: number, shelf: string): Promise<void> {
    const req = this.requestBuilder()
      .post()
      .setSegment("route", "shelf/add_to_shelf.xml")
      .addFormParameter("name", shelf)
      .addFormParameter("book_id", bookId)
      .addFormParameter("a", "remove");

    // in case not found in shelf
    req.suppressHttpError = true;

    await this.oAuthExecute(req);
  }

  private async addToShelves(bookId: string, shelves: string[]): Promise<void> {
    const req = this.requestBuilder()
      .post()
      .setSegment("route", "shelf/add_books_to_shelves.xml")
      .addFormParameter("bookids", bookId)
      .addFormParameter("shelves", shelves.join(","));

    await this.oAuthExecute(req);
  }
}
