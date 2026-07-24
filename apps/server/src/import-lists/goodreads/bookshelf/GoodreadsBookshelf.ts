import type { IConfigService } from "../../../config/configService.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import type { ImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import { newImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import type { IParsingService, ImportListLogger } from "../../ImportListBase.js";
import { noopImportListLogger } from "../../ImportListBase.js";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import { GoodreadsImportListBase } from "../GoodreadsImportListBase.js";
import {
  deserializeGoodreadsResponse,
  parseReview,
  parseUserShelf,
} from "../goodreadsXmlResources.js";
import type { GoodreadsReview, GoodreadsUserShelf } from "../goodreadsXmlResources.js";
import type { GoodreadsBookshelfImportListSettings } from "./GoodreadsBookshelfImportListSettings.js";

/** Ported from Books/Model's implicit "clean spaces" text normalization -- see `books/textMatching.ts`'s equivalent, reused narrowly here rather than pulling that whole module in for one string op. */
function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/Bookshelf/GoodreadsBookshelf.cs.
 *
 * LIVE-SERVICE STATUS: see `GoodreadsSettingsBase.ts`'s doc comment -- dead
 * Goodreads Developer API, ported faithfully anyway.
 */
export class GoodreadsBookshelf extends GoodreadsImportListBase<GoodreadsBookshelfImportListSettings> {
  constructor(
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    httpClient: IHttpClient,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, httpClient, logger);
  }

  override readonly name = "Goodreads Bookshelves";
  override readonly configContract = "GoodreadsBookshelfImportListSettings";
  override readonly minRefreshIntervalMs = 12 * 60 * 60 * 1000;

  override async fetch(): Promise<ImportListItemInfo[]> {
    const perShelf = await Promise.all(
      this.settings.bookshelfIds.map((shelf) => this.fetchShelf(shelf))
    );
    return this.cleanupListItems(perShelf.flat());
  }

  /** Ported from `GoodreadsBookshelf.Fetch(string shelf)`. */
  async fetchShelf(shelf: string): Promise<ImportListItemInfo[]> {
    const reviews: GoodreadsReview[] = [];
    let page = 0;

    while (true) {
      page++;
      const curr = await this.getReviews(shelf, page);

      if (curr === null || curr.length === 0) {
        break;
      }

      reviews.push(...curr);
    }

    return reviews
      .filter(
        (r): r is GoodreadsReview & { book: NonNullable<GoodreadsReview["book"]> } =>
          r.book !== null
      )
      .map((r) => {
        const author = r.book.authors[0];
        const item = newImportListItemInfo();
        item.author = author ? cleanSpaces(author.name) : null;
        item.book = cleanSpaces(r.book.titleWithoutSeries);
        item.editionGoodreadsId = r.book.id;
        return item;
      });
  }

  override async requestAction(action: string, query: Record<string, string>): Promise<unknown> {
    if (action === "getBookshelves") {
      if (!this.settings.accessToken || this.settings.accessToken.trim() === "") {
        return { shelves: [] };
      }

      const validation = this.settings.validate();
      const accessTokenFailure = validation.errors.find((e) => e.propertyName === "accessToken");
      if (accessTokenFailure) {
        throw new Error(accessTokenFailure.errorMessage);
      }

      const shelves: GoodreadsUserShelf[] = [];
      let page = 0;

      while (true) {
        page++;
        const curr = await this.getShelfList(page);
        if (curr === null || curr.length === 0) {
          break;
        }
        shelves.push(...curr);
      }

      const helptext = {
        shelfIds: `Import books from ${this.settings.userName}'s shelves:`,
      };

      return {
        options: {
          helptext,
          user: this.settings.userName,
          shelves: [...shelves]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => ({ id: s.name, name: s.name })),
        },
      };
    }

    return super.requestAction(action, query);
  }

  /** Ported from `GoodreadsBookshelf.GetShelfList(int page)`. */
  private async getShelfList(page: number): Promise<GoodreadsUserShelf[]> {
    try {
      const builder = this.requestBuilder()
        .setSegment("route", "shelf/list.xml")
        .addQueryParam("user_id", this.settings.userId ?? "")
        .addQueryParam("page", page);

      const httpResponse = await this.oAuthGet(builder);

      return deserializeGoodreadsResponse(httpResponse.content, "shelves", parseUserShelf) ?? [];
    } catch (ex) {
      this.logger.warn("Error fetching bookshelves from Goodreads: %s", ex);
      return [];
    }
  }

  /** Ported from `GoodreadsBookshelf.GetReviews(string shelf, int page)`. */
  private async getReviews(shelf: string, page: number): Promise<GoodreadsReview[]> {
    try {
      const builder = this.requestBuilder()
        .setSegment("route", "review/list.xml")
        .addQueryParam("v", 2)
        .addQueryParam("id", this.settings.userId ?? "")
        .addQueryParam("shelf", shelf)
        .addQueryParam("per_page", 200)
        .addQueryParam("page", page);

      const httpResponse = await this.oAuthGet(builder);

      return deserializeGoodreadsResponse(httpResponse.content, "reviews", parseReview) ?? [];
    } catch (ex) {
      this.logger.warn("Error fetching bookshelves from Goodreads: %s", ex);
      return [];
    }
  }
}
