/**
 * Ported from NzbDrone.Core/Notifications/Goodreads/OwnedBooks/GoodreadsOwnedBooks.cs.
 * See `../GoodreadsSettingsBase.ts`'s doc comment for this integration's
 * live-service (dead) status.
 */

import type { IHttpClient } from "../../../http/HttpClient.js";
import type { BookDownloadMessage } from "../../BookDownloadMessage.js";
import { GoodreadsNotificationBase, type GoodreadsLogger } from "../GoodreadsNotificationBase.js";
import type { GoodreadsOwnedBooksNotificationSettings } from "./GoodreadsOwnedBooksNotificationSettings.js";

export class GoodreadsOwnedBooks extends GoodreadsNotificationBase<GoodreadsOwnedBooksNotificationSettings> {
  readonly name = "Goodreads Owned Books";
  readonly configContract = "GoodreadsOwnedBooksNotificationSettings";
  override readonly link = "https://goodreads.com/";

  constructor(httpClient: IHttpClient, logger?: GoodreadsLogger) {
    super(httpClient, logger);
  }

  /**
   * NOTE on async/void: see `GoodreadsBookshelf.ts`'s doc comment on the
   * same pattern -- `INotification.OnReleaseImport` is `void` in the real
   * C#, so this is a synchronous wrapper that fires the async work without
   * awaiting it.
   */
  override onReleaseImport(message: BookDownloadMessage): void {
    void this.onReleaseImportAsync(message);
  }

  private async onReleaseImportAsync(message: BookDownloadMessage): Promise<void> {
    const monitoredEdition = (message.book?.editions ?? []).find((e) => e.monitored);
    if (monitoredEdition) {
      await this.addOwnedBook(monitoredEdition.foreignEditionId);
    }
  }

  private async addOwnedBook(bookId: string): Promise<void> {
    const req = this.requestBuilder()
      .post()
      .setSegment("route", "owned_books.xml")
      .addFormParameter("owned_book[book_id]", bookId)
      .addFormParameter("owned_book[condition_code]", this.settings.condition)
      .addFormParameter("owned_book[original_purchase_date]", new Date().toISOString());

    if (this.settings.description) {
      req.addFormParameter("owned_book[condition_description]", this.settings.description);
    }

    if (this.settings.location) {
      req.addFormParameter("owned_book[original_purchase_location]", this.settings.location);
    }

    await this.oAuthExecute(req);
  }
}
