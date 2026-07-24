import type { Author, Book } from "../books/models.js";
import { newAuthor, newBook, newEdition, MonitorTypes, BookAddType } from "../books/models.js";
import type { AuthorService } from "../books/authorService.js";
import type { BookService } from "../books/bookService.js";
import type { EditionService } from "../books/editionService.js";
import type { IProvideBookInfo } from "../metadata-source/interfaces.js";
import type { IManageCommandQueue } from "../messaging/commands/commandQueueManager.js";
import type { IEvent } from "../messaging/events/iEvent.js";
import type { IExecute } from "../messaging/commands/iExecute.js";
import { ImportListMonitorType, type ImportListDefinition } from "./ImportListDefinition.js";
import type { IImportListFactory } from "./ImportListFactory.js";
import type { IImportListExclusionService } from "./exclusions/ImportListExclusionService.js";
import type { ImportListExclusion } from "./exclusions/ImportListExclusion.js";
import type { IFetchAndParseImportList } from "./FetchAndParseImportListService.js";
import { ImportListSyncCommand } from "./ImportListSyncCommand.js";
import { ImportListSyncCompleteEvent } from "./ImportListSyncCompleteEvent.js";
import {
  BookSearchCommand,
  BulkRefreshAuthorCommand,
  MissingBookSearchCommand,
  type IAddAuthorService,
  type IAddBookService,
  type IGoodreadsProxy,
  type IGoodreadsSearchProxy,
} from "./forwardRefs.js";
import type { ImportListItemInfo } from "../parser/model/importListItemInfo.js";

/** Minimal event-publishing seam this service needs, matching the module's other narrow `IEventAggregator` shapes. */
export interface ImportListSyncEventAggregator {
  publishEvent(event: IEvent): void;
}

/** Minimal logger surface this service needs. */
export interface ImportListSyncLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  progressInfo(message: string, ...args: unknown[]): void;
  progressTrace(message: string, ...args: unknown[]): void;
}

const noopLogger: ImportListSyncLogger = {
  trace: () => {},
  debug: () => {},
  progressInfo: () => {},
  progressTrace: () => {},
};

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListSyncService.cs.
 *
 * `IExecute<ImportListSyncCommand>` here is the REAL
 * `messaging/commands/iExecute.ts` interface (per this module's task
 * brief). Several of this service's real C# dependencies belong to modules
 * genuinely out of scope for "ImportLists' own core domain module" --
 * `IAddAuthorService`/`IAddBookService` (the author/book *add-workflow*
 * module, not yet ported), `IGoodreadsProxy`/`IGoodreadsSearchProxy` (the
 * dead MetadataSource Goodreads client, deliberately not ported --
 * `docs/known-issues-fixlist.md` #1), and `BulkRefreshAuthorCommand`/
 * `BookSearchCommand`/`MissingBookSearchCommand` (Books/Commands and
 * IndexerSearch command classes). See `forwardRefs.ts` for the narrow
 * interfaces/stub command classes standing in for each, and this module's
 * final report for the complete list.
 *
 * `IProvideBookInfo` is the one exception: it's the REAL, already-ported
 * `metadata-source/interfaces.ts` interface (satisfied today by the
 * priority-chain of Hardcover/OpenLibrary/Google Books, not a forward-ref).
 */
export class ImportListSyncService implements IExecute<ImportListSyncCommand> {
  constructor(
    private readonly importListFactory: IImportListFactory,
    private readonly importListExclusionService: IImportListExclusionService,
    private readonly listFetcherAndParser: IFetchAndParseImportList,
    private readonly goodreadsProxy: IGoodreadsProxy,
    private readonly goodreadsSearchProxy: IGoodreadsSearchProxy,
    private readonly bookInfoProxy: IProvideBookInfo,
    private readonly authorService: AuthorService,
    private readonly bookService: BookService,
    private readonly editionService: EditionService,
    private readonly addAuthorService: IAddAuthorService,
    private readonly addBookService: IAddBookService,
    private readonly eventAggregator: ImportListSyncEventAggregator,
    private readonly commandQueueManager: IManageCommandQueue,
    private readonly logger: ImportListSyncLogger = noopLogger
  ) {}

  /** Ported from ImportListSyncService.SyncAll(). */
  private async syncAll(): Promise<Book[]> {
    if (this.importListFactory.automaticAddEnabled().length === 0) {
      this.logger.debug("No import lists with automatic add enabled");
      return [];
    }

    this.logger.progressInfo("Starting Import List Sync");

    const listItems = await this.listFetcherAndParser.fetch();

    return this.processListItems(listItems);
  }

  /** Ported from ImportListSyncService.SyncList(ImportListDefinition). */
  private async syncList(definition: ImportListDefinition): Promise<Book[]> {
    this.logger.progressInfo(`Starting Import List Refresh for List ${definition.name}`);

    const listItems = await this.listFetcherAndParser.fetchSingleList(definition);

    return this.processListItems(listItems);
  }

  /** Ported from ImportListSyncService.ProcessListItems(List<ImportListItemInfo>). */
  private async processListItems(items: ImportListItemInfo[]): Promise<Book[]> {
    const processed: Book[] = [];
    const authorsToAdd: Author[] = [];
    const booksToAdd: Book[] = [];

    if (items.length === 0) {
      this.logger.progressInfo("No list items to process");
      return [];
    }

    this.logger.progressInfo("Processing %d list items", items.length);

    let reportNumber = 1;

    const listExclusions = this.importListExclusionService.all();

    for (const report of items) {
      this.logger.progressTrace("Processing list item %d/%d", reportNumber, items.length);
      reportNumber++;

      const importList = this.importListFactory.get(report.importListId);

      if (isNotBlank(report.book) || isNotBlank(report.editionGoodreadsId)) {
        if (
          isBlank(report.editionGoodreadsId) ||
          isBlank(report.authorGoodreadsId) ||
          isBlank(report.bookGoodreadsId)
        ) {
          await this.mapBookReport(report);
        }

        await this.processBookReport(importList, report, listExclusions, booksToAdd, authorsToAdd);
      } else if (isNotBlank(report.author) || isNotBlank(report.authorGoodreadsId)) {
        if (isBlank(report.authorGoodreadsId)) {
          await this.mapAuthorReport(report);
        }

        this.processAuthorReport(importList, report, listExclusions, authorsToAdd);
      }
    }

    const addedAuthors = this.addAuthorService.addAuthors(authorsToAdd, false);
    const addedBooks = this.addBookService.addBooks(booksToAdd, false);

    const message = `Import List Sync Completed. Items found: ${items.length}, Authors added: ${authorsToAdd.length}, Books added: ${booksToAdd.length}`;
    this.logger.progressInfo(message);

    const toRefresh = Array.from(
      new Set([...addedAuthors.map((a) => a.id), ...addedBooks.map((b) => b.author!.id)])
    );

    if (toRefresh.length > 0) {
      this.commandQueueManager.push(new BulkRefreshAuthorCommand(toRefresh, true));
    }

    return processed;
  }

  /** Ported from ImportListSyncService.MapBookReport(ImportListItemInfo). */
  private async mapBookReport(report: ImportListItemInfo): Promise<void> {
    if (isNotBlank(report.authorGoodreadsId) && isNotBlank(report.bookGoodreadsId)) {
      return;
    }

    if (isNotBlank(report.editionGoodreadsId) && isParsableInt(report.editionGoodreadsId)) {
      const edition = this.editionService.getEditionByForeignEditionId(report.editionGoodreadsId!);

      if (edition) {
        const book = edition.book!;
        report.bookGoodreadsId = book.foreignBookId;
        report.book = edition.title;
        report.author ??= book.authorMetadata?.name ?? null;
        report.authorGoodreadsId ??= book.authorMetadata?.foreignAuthorId ?? null;
        return;
      }

      try {
        const remoteBook = await this.goodreadsProxy.getBookInfo(report.editionGoodreadsId!);

        this.logger.trace(
          `Mapped ${report.editionGoodreadsId} to [${remoteBook.foreignBookId}] ${remoteBook.title}`
        );

        report.bookGoodreadsId = remoteBook.foreignBookId;
        report.book = remoteBook.title;
        report.author ??= remoteBook.authorName;
        report.authorGoodreadsId ??= remoteBook.authorForeignId;
      } catch {
        this.logger.debug(`Nothing found for edition [${report.editionGoodreadsId}]`);
        report.editionGoodreadsId = null;
      }
    } else if (isNotBlank(report.bookGoodreadsId)) {
      const mappedBook = await this.bookInfoProxy.getBookInfo(report.bookGoodreadsId!);

      report.bookGoodreadsId = mappedBook.book.foreignBookId;
      report.book = mappedBook.book.title;
      report.authorGoodreadsId = mappedBook.authorMetadata[0]?.foreignAuthorId ?? null;
    } else {
      const [mappedBook] = await this.goodreadsSearchProxy.search(
        `${report.book} ${report.author}`
      );

      if (!mappedBook) {
        this.logger.trace(`Nothing found for ${report.author} - ${report.book}`);
        return;
      }

      this.logger.trace(
        `Mapped Book ${report.book} by Author ${report.author} to [${mappedBook.workId}] ${mappedBook.bookTitleBare}`
      );

      report.bookGoodreadsId = mappedBook.workId;
      report.book = mappedBook.bookTitleBare;
      report.author ??= mappedBook.author.name;
      report.authorGoodreadsId ??= mappedBook.author.id;
      report.editionGoodreadsId = mappedBook.bookId;
    }
  }

  /** Ported from ImportListSyncService.ProcessBookReport(...). */
  private async processBookReport(
    importList: ImportListDefinition,
    report: ImportListItemInfo,
    listExclusions: ImportListExclusion[],
    booksToAdd: Book[],
    authorsToAdd: Author[]
  ): Promise<void> {
    const existingBook = report.bookGoodreadsId
      ? this.bookService.findById(report.bookGoodreadsId)
      : undefined;

    const excludedBook = listExclusions.find((s) => s.foreignId === report.bookGoodreadsId);
    const excludedAuthor = listExclusions.find((s) => s.foreignId === report.authorGoodreadsId);

    if (excludedBook !== undefined) {
      this.logger.debug(
        "%s [%s] Rejected due to list exclusion",
        report.editionGoodreadsId,
        report.book
      );
      return;
    }

    if (excludedAuthor !== undefined) {
      this.logger.debug(
        "%s [%s] Rejected due to list exclusion for parent author",
        report.editionGoodreadsId,
        report.book
      );
      return;
    }

    if (existingBook !== undefined) {
      this.logger.debug(
        "%s [%s] Rejected, Book Exists in DB.  Ensuring Book and Author monitored.",
        report.editionGoodreadsId,
        report.book
      );

      if (
        importList.shouldMonitorExisting &&
        importList.shouldMonitor !== ImportListMonitorType.None
      ) {
        if (!existingBook.monitored) {
          this.bookService.setBookMonitored(existingBook.id, true);

          if (importList.shouldMonitor === ImportListMonitorType.SpecificBook) {
            this.commandQueueManager.push(new BookSearchCommand([existingBook.id]));
          }
        }

        const existingAuthor = existingBook.author!;
        let doSearch = false;

        if (importList.shouldMonitor === ImportListMonitorType.EntireAuthor) {
          const unmonitoredBooks = (existingAuthor.books ?? []).filter((b) => !b.monitored);
          if (unmonitoredBooks.length > 0) {
            doSearch = true;
            this.bookService.setMonitored(
              (existingAuthor.books ?? []).map((b) => b.id),
              true
            );
          }
        }

        if (!existingAuthor.monitored) {
          doSearch = true;
          existingAuthor.monitored = true;
          this.authorService.updateAuthor(existingAuthor);
        }

        if (doSearch) {
          this.commandQueueManager.push(new MissingBookSearchCommand(existingAuthor.id));
        }
      }

      return;
    }

    // Append Book if not already in DB or already on add list
    if (booksToAdd.every((s) => s.foreignBookId !== report.bookGoodreadsId)) {
      const monitored = importList.shouldMonitor !== ImportListMonitorType.None;

      let toAddAuthor: Author = {
        ...newAuthor(),
        monitored,
        monitorNewItems: importList.monitorNewItems,
        rootFolderPath: importList.rootFolderPath,
        qualityProfileId: importList.profileId,
        metadataProfileId: importList.metadataProfileId,
        tags: importList.tags,
        addOptions: {
          searchForMissingBooks: importList.shouldSearch,
          monitored,
          monitor: monitored ? MonitorTypes.All : MonitorTypes.None,
          booksToMonitor: [],
        },
      };

      if (report.authorGoodreadsId !== null && report.author !== null) {
        const processed = this.processAuthorReport(
          importList,
          report,
          listExclusions,
          authorsToAdd
        );
        if (processed) {
          toAddAuthor = processed;
        }
      }

      const toAdd: Book = {
        ...newBook(),
        foreignBookId: report.bookGoodreadsId ?? "",
        monitored,
        anyEditionOk: true,
        editions: [],
        author: toAddAuthor,
        addOptions: {
          // Only search for new book for existing authors.
          // New author searches are triggered by SearchForMissingBooks.
          addType: BookAddType.Automatic,
          searchForNewBook: importList.shouldSearch && toAddAuthor.id > 0,
        },
      };

      if (isNotBlank(report.editionGoodreadsId) && isParsableInt(report.editionGoodreadsId)) {
        toAdd.editions = [
          {
            ...newEdition(),
            foreignEditionId: report.editionGoodreadsId!,
            monitored: true,
          },
        ];
      }

      if (
        importList.shouldMonitor === ImportListMonitorType.SpecificBook &&
        toAddAuthor.addOptions !== undefined
      ) {
        toAddAuthor.addOptions.booksToMonitor.push(toAdd.foreignBookId);
      }

      booksToAdd.push(toAdd);
    }
  }

  /** Ported from ImportListSyncService.MapAuthorReport(ImportListItemInfo). */
  private async mapAuthorReport(report: ImportListItemInfo): Promise<void> {
    const [mappedBook] = await this.goodreadsSearchProxy.search(report.author ?? "");

    if (!mappedBook) {
      this.logger.trace(`Nothing found for ${report.author}`);
      return;
    }

    this.logger.trace(`Mapped ${report.author} to [${mappedBook.author.name}]`);

    report.author = mappedBook.author.name;
    report.authorGoodreadsId = mappedBook.author.id;
  }

  /** Ported from ImportListSyncService.ProcessAuthorReport(...). */
  private processAuthorReport(
    importList: ImportListDefinition,
    report: ImportListItemInfo,
    listExclusions: ImportListExclusion[],
    authorsToAdd: Author[]
  ): Author | null {
    if (report.authorGoodreadsId === null) {
      return null;
    }

    const existingAuthor = this.authorService.findById(report.authorGoodreadsId);
    const excludedAuthor = listExclusions.find((s) => s.foreignId === report.authorGoodreadsId);
    const existingImportAuthor = authorsToAdd.find(
      (i) => i.metadata?.foreignAuthorId === report.authorGoodreadsId
    );

    if (excludedAuthor !== undefined) {
      this.logger.debug(
        "%s [%s] Rejected due to list exclusion",
        report.authorGoodreadsId,
        report.author
      );
      return null;
    }

    if (existingAuthor !== undefined) {
      this.logger.debug(
        "%s [%s] Rejected, Author Exists in DB.  Ensuring Author monitored",
        report.authorGoodreadsId,
        report.author
      );

      if (importList.shouldMonitorExisting && !existingAuthor.monitored) {
        existingAuthor.monitored = true;
        this.authorService.updateAuthor(existingAuthor);
      }

      return existingAuthor;
    }

    if (existingImportAuthor !== undefined) {
      this.logger.debug(
        "%s [%s] Rejected, Author Exists in Import.",
        report.authorGoodreadsId,
        report.author
      );
      return existingImportAuthor;
    }

    const monitored = importList.shouldMonitor !== ImportListMonitorType.None;

    const toAdd: Author = {
      ...newAuthor(),
      metadata: {
        id: 0,
        foreignAuthorId: report.authorGoodreadsId,
        titleSlug: "",
        name: report.author ?? "",
        sortName: "",
        nameLastFirst: "",
        sortNameLastFirst: "",
        aliases: [],
        overview: null,
        disambiguation: null,
        gender: null,
        hometown: null,
        born: null,
        died: null,
        status: 0,
        images: [],
        links: [],
        genres: [],
        ratings: { votes: 0, value: 0 },
      },
      monitored,
      monitorNewItems: importList.monitorNewItems,
      rootFolderPath: importList.rootFolderPath,
      qualityProfileId: importList.profileId,
      metadataProfileId: importList.metadataProfileId,
      tags: importList.tags,
      addOptions: {
        searchForMissingBooks: importList.shouldSearch,
        monitored,
        monitor: monitored ? MonitorTypes.All : MonitorTypes.None,
        booksToMonitor: [],
      },
    };

    authorsToAdd.push(toAdd);

    return toAdd;
  }

  /** Ported from ImportListSyncService.Execute(ImportListSyncCommand). */
  async execute(message: ImportListSyncCommand): Promise<void> {
    const processed =
      message.definitionId !== null
        ? await this.syncList(this.importListFactory.get(message.definitionId))
        : await this.syncAll();

    this.eventAggregator.publishEvent(new ImportListSyncCompleteEvent(processed));
  }
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function isNotBlank(value: string | null | undefined): boolean {
  return !isBlank(value);
}

function isParsableInt(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return /^-?\d+$/.test(value.trim());
}
