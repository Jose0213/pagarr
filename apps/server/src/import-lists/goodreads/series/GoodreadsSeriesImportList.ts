import type { IConfigService } from "../../../config/configService.js";
import { HttpException } from "../../../http/HttpException.js";
import type { ImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import { newImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import type { IProvideSeriesInfo } from "../../../metadata-source/interfaces.js";
import type { ValidationFailure } from "../../../thingi-provider/IProviderConfig.js";
import {
  ImportListBase,
  type IParsingService,
  type ImportListLogger,
  noopImportListLogger,
} from "../../ImportListBase.js";
import { ImportListType } from "../../ImportListType.js";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import type { GoodreadsSeriesImportListSettings } from "./GoodreadsSeriesImportListSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/Series/GoodreadsSeriesImportList.cs.
 *
 * LIVE-SERVICE STATUS: same as `GoodreadsListImportList.ts` -- `IProvideSeriesInfo`
 * (`metadata-source/interfaces.ts`) is a real, already-ported interface with
 * no live implementing provider (dead Goodreads Developer API). Injected
 * narrowly, ported faithfully.
 */
export class GoodreadsSeriesImportList extends ImportListBase<GoodreadsSeriesImportListSettings> {
  private readonly seriesInfo: IProvideSeriesInfo;

  constructor(
    seriesInfo: IProvideSeriesInfo,
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, logger);
    this.seriesInfo = seriesInfo;
  }

  override readonly name = "Goodreads Series";
  override readonly configContract = "GoodreadsSeriesImportListSettings";
  override readonly listType = ImportListType.Goodreads;
  override readonly minRefreshIntervalMs = 12 * 60 * 60 * 1000;

  /**
   * Ported from `GoodreadsSeriesImportList.Fetch()`. The real C# reads
   * `work.Id`/`work.OriginalTitle` (book-goodreads-id + title) and
   * `work.BestBook.{Id,AuthorName,AuthorId}` (edition id + author) off each
   * series work -- see `GoodreadsListImportList.fetchPage`'s doc comment
   * for the identical rationale: `SeriesInfoResult`'s stub `books` shape
   * (`{ foreignBookId, position }`) has no title/author fields to map, so
   * this leaves `book`/`author`/`authorGoodreadsId` null rather than
   * fabricating values.
   */
  override async fetch(): Promise<ImportListItemInfo[]> {
    const result: ImportListItemInfo[] = [];

    try {
      const series = await this.seriesInfo.getSeriesInfo(String(this.settings.seriesId));

      for (const book of series.books) {
        const item = newImportListItemInfo();
        item.bookGoodreadsId = book.foreignBookId;
        item.book = null;
        item.editionGoodreadsId = book.foreignBookId;
        item.author = null;
        item.authorGoodreadsId = null;
        result.push(item);
      }

      this.importListStatusService.recordSuccess(this.definition.id);
    } catch {
      this.importListStatusService.recordFailure(this.definition.id);
    }

    return this.cleanupListItems(result);
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    const failure = await this.testConnectionInternal();
    if (failure !== null) {
      failures.push(failure);
    }
  }

  private async testConnectionInternal(): Promise<ValidationFailure | null> {
    try {
      await this.seriesInfo.getSeriesInfo(String(this.settings.seriesId));
      return null;
    } catch (e) {
      if (e instanceof HttpException) {
        this.logger.warn("Goodreads API Error: %s", e);
        if (e.response.statusCode === 404) {
          return {
            propertyName: "seriesId",
            errorMessage: `Series ${this.settings.seriesId} not found`,
          };
        }

        return { propertyName: "seriesId", errorMessage: "Could not get series data" };
      }

      this.logger.warn("Unable to connect to Goodreads: %s", e);
      return {
        propertyName: "",
        errorMessage: "Unable to connect to import list, check the log for more details",
      };
    }
  }
}
