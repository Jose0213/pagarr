import type { IConfigService } from "../../../config/configService.js";
import { HttpException } from "../../../http/HttpException.js";
import type { ImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import { newImportListItemInfo } from "../../../parser/model/importListItemInfo.js";
import type { IProvideListInfo } from "../../../metadata-source/interfaces.js";
import type { ValidationFailure } from "../../../thingi-provider/IProviderConfig.js";
import {
  ImportListBase,
  type IParsingService,
  type ImportListLogger,
  noopImportListLogger,
} from "../../ImportListBase.js";
import { ImportListType } from "../../ImportListType.js";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import type { GoodreadsListImportListSettings } from "./GoodreadsListImportListSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/Lists/GoodreadsListImportList.cs.
 *
 * LIVE-SERVICE STATUS: `IProvideListInfo` (`metadata-source/interfaces.ts`)
 * is a shape-only stub -- "no provider in this module implements it" per
 * that file's own doc comment -- so this provider is a genuine forward-ref:
 * it ports the real fetch/pagination/error-handling logic faithfully
 * against the real interface shape, but has no live implementation to call
 * through to (same dead-Goodreads-Developer-API status as every other
 * Goodreads touchpoint in this project, for the same underlying reason --
 * `IProvideListInfo` exists ONLY to describe what a Goodreads user-list
 * lookup would need to look like, and nothing implements it because the API
 * it would call is dead). Injectable via constructor per this module's
 * "inject the missing piece narrowly" convention.
 */
export class GoodreadsListImportList extends ImportListBase<GoodreadsListImportListSettings> {
  private readonly listInfo: IProvideListInfo;

  constructor(
    listInfo: IProvideListInfo,
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, logger);
    this.listInfo = listInfo;
  }

  override readonly name = "Goodreads List";
  override readonly configContract = "GoodreadsListImportListSettings";
  override readonly listType = ImportListType.Goodreads;
  override readonly minRefreshIntervalMs = 12 * 60 * 60 * 1000;

  override async fetch(): Promise<ImportListItemInfo[]> {
    const result: ImportListItemInfo[] = [];

    try {
      let pageNum = 1;
      while (true) {
        if (pageNum > 100) {
          // you always seem to get back page 100 for bigger pages...
          break;
        }

        const page = await this.fetchPage(pageNum++);

        if (page.length > 0) {
          result.push(...page);
        } else {
          break;
        }
      }

      this.importListStatusService.recordSuccess(this.definition.id);
    } catch {
      this.importListStatusService.recordFailure(this.definition.id);
    }

    return this.cleanupListItems(result);
  }

  /**
   * Ported from `GoodreadsListImportList.FetchPage(int page)`. The real C#
   * reads `book.Work.Id`/`book.Work.OriginalTitle` (work/book-goodreads-id +
   * title), `book.Id` (edition id), and `book.Authors.FirstOrDefault()`
   * (author name + id) off each list entry -- fields that came from the
   * dead MetadataSource Goodreads `ListResource`/`BookSummaryResource` DTOs
   * (see `goodreadsXmlResources.ts`'s doc comment on that framework not
   * being reconstructed). `metadata-source/interfaces.ts`'s `ListInfoResult`
   * stub -- "no provider in this module implements it" per that file's own
   * doc comment -- only declares `books: Array<{ foreignBookId: string }>`,
   * i.e. it has no title/author fields to read at all. This mapping uses
   * the one field the stub actually has (`foreignBookId`, standing in for
   * both `book.Work.Id` and `book.Id` -- the stub doesn't distinguish work
   * vs. edition id) and leaves `book`/`author`/`authorGoodreadsId` null
   * rather than fabricating placeholder values; a future concrete
   * `IProvideListInfo` implementation with real title/author fields would
   * populate them the same way `GoodreadsBookshelf`/`GoodreadsOwnedBooks`
   * do from their own (also-narrowed) DTOs.
   *
   * EMERGENT CONSEQUENCE OF THE ABOVE (worth flagging, not a bug in this
   * port): `ImportListBase.cleanupListItems()` (the REAL C#
   * `CleanupListItems`'s `DistinctBy(r => new { r.Author, r.Book })`,
   * faithfully ported) dedups every fetched item by the `(author, book)`
   * pair. Since every item this method produces has `author: null, book:
   * null` (per the stub-shape limitation above), EVERY item from EVERY page
   * collapses onto the exact same dedup key -- `fetch()` can therefore never
   * return more than one item total, no matter how many pages/books the
   * injected `IProvideListInfo` implementation reports. This is a real,
   * observable interaction between the faithfully-ported dedup logic and
   * the stub interface's missing fields, confirmed in this file's own test
   * suite (`__tests__/goodreads/GoodreadsListImportList.test.ts`) -- not
   * something to "fix" here (that's downstream of whichever future
   * `IProvideListInfo` implementation supplies real author/title data).
   */
  private async fetchPage(page: number): Promise<ImportListItemInfo[]> {
    const list = await this.listInfo.getListInfo(String(this.settings.listId), page);
    const result: ImportListItemInfo[] = [];

    for (const book of list.books) {
      const item = newImportListItemInfo();
      item.bookGoodreadsId = book.foreignBookId;
      item.book = null;
      item.editionGoodreadsId = book.foreignBookId;
      item.author = null;
      item.authorGoodreadsId = null;
      result.push(item);
    }

    return result;
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    const failure = await this.testConnectionInternal();
    if (failure !== null) {
      failures.push(failure);
    }
  }

  private async testConnectionInternal(): Promise<ValidationFailure | null> {
    try {
      await this.listInfo.getListInfo(String(this.settings.listId), 1);
      return null;
    } catch (e) {
      if (e instanceof HttpException) {
        this.logger.warn("Goodreads API Error: %s", e);
        if (e.response.statusCode === 404) {
          return { propertyName: "listId", errorMessage: `List ${this.settings.listId} not found` };
        }

        return { propertyName: "listId", errorMessage: "Could not get list data" };
      }

      this.logger.warn("Unable to connect to Goodreads: %s", e);
      return {
        propertyName: "",
        errorMessage: "Unable to connect to import list, check the log for more details",
      };
    }
  }
}
