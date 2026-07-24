import type { IConfigService } from "../../../config/configService.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import type { ImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import { newImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import type { IParsingService, ImportListLogger } from "../../ImportListBase.js";
import { noopImportListLogger } from "../../ImportListBase.js";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import { GoodreadsImportListBase } from "../GoodreadsImportListBase.js";
import { deserializeGoodreadsResponse, parseOwnedBook } from "../goodreadsXmlResources.js";
import type { GoodreadsOwnedBook } from "../goodreadsXmlResources.js";
import type { GoodreadsOwnedBooksImportListSettings } from "./GoodreadsOwnedBooksImportListSettings.js";

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/OwnedBooks/GoodreadsOwnedBooks.cs.
 *
 * LIVE-SERVICE STATUS: see `GoodreadsSettingsBase.ts`'s doc comment -- dead
 * Goodreads Developer API, ported faithfully anyway.
 */
export class GoodreadsOwnedBooks extends GoodreadsImportListBase<GoodreadsOwnedBooksImportListSettings> {
  constructor(
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    httpClient: IHttpClient,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, httpClient, logger);
  }

  override readonly name = "Goodreads Owned Books";
  override readonly configContract = "GoodreadsOwnedBooksImportListSettings";
  override readonly minRefreshIntervalMs = 12 * 60 * 60 * 1000;

  override async fetch(): Promise<ImportListItemInfo[]> {
    const reviews: GoodreadsOwnedBook[] = [];
    let page = 0;

    while (true) {
      page++;
      const curr = await this.getOwned(page);

      if (curr === null || curr.length === 0) {
        break;
      }

      reviews.push(...curr);
    }

    const result = reviews
      .filter(
        (r): r is GoodreadsOwnedBook & { book: NonNullable<GoodreadsOwnedBook["book"]> } =>
          r.book !== null
      )
      .map((r) => {
        const author = r.book.authors[0];
        const item = newImportListItemInfo();
        item.author = author ? cleanSpaces(author.name) : null;
        item.authorGoodreadsId = author ? author.id : null;
        item.book = cleanSpaces(r.book.titleWithoutSeries);
        item.editionGoodreadsId = r.book.id;
        return item;
      });

    return this.cleanupListItems(result);
  }

  /** Ported from `GoodreadsOwnedBooks.GetOwned(int page)`. */
  private async getOwned(page: number): Promise<GoodreadsOwnedBook[]> {
    try {
      const builder = this.requestBuilder()
        .setSegment("route", "owned_books/user")
        .addQueryParam("format", "xml")
        .addQueryParam("id", this.settings.userId ?? "")
        .addQueryParam("page", page);

      const httpResponse = await this.oAuthGet(builder);

      return (
        deserializeGoodreadsResponse(httpResponse.content, "owned_books", parseOwnedBook) ?? []
      );
    } catch (ex) {
      this.logger.warn("Error fetching bookshelves from Goodreads: %s", ex);
      return [];
    }
  }
}
