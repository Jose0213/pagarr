import { describe, expect, it, vi } from "vitest";
import { ImportListSyncService } from "../ImportListSyncService.js";
import type { IImportListFactory } from "../ImportListFactory.js";
import type { IImportListExclusionService } from "../exclusions/ImportListExclusionService.js";
import type { IFetchAndParseImportList } from "../FetchAndParseImportListService.js";
import { createImportListDefinition, ImportListMonitorType } from "../ImportListDefinition.js";
import { ImportListSyncCommand } from "../ImportListSyncCommand.js";
import { newImportListItemInfo } from "../../parser/model/importListItemInfo.js";
import { newAuthor, newAuthorMetadata, newBook } from "../../books/models.js";
import type { Author, Book } from "../../books/models.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/ImportListSyncServiceFixture.cs.
 * Exercises `ProcessListItems`/`ProcessBookReport`/`ProcessAuthorReport` --
 * the core "should this list item be added, or rejected as excluded /
 * already-in-DB" decision logic.
 */
function fakeFactory(
  definition = createImportListDefinition({ id: 1, name: "List" })
): IImportListFactory {
  return {
    get: vi.fn(() => definition),
    getInstance: vi.fn(),
    getAvailableProviders: vi.fn(() => []),
    // Non-empty by default -- ImportListSyncService.syncAll() early-returns
    // ("No import lists with automatic add enabled") when this is empty,
    // matching the real C# `_importListFactory.AutomaticAddEnabled().Empty()`
    // guard. Individual tests below exercise `execute()`'s downstream
    // per-report logic, so the factory must report at least one enabled list.
    automaticAddEnabled: vi.fn(() => [{ definition } as never]),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
  };
}

function fakeExclusionService(
  exclusions: Array<{ foreignId: string; name: string }> = []
): IImportListExclusionService {
  return {
    add: vi.fn(),
    all: vi.fn(() => exclusions.map((e, i) => ({ id: i + 1, ...e }))),
    delete: vi.fn(),
    deleteByForeignId: vi.fn(),
    get: vi.fn(),
    findByForeignId: vi.fn(),
    findByForeignIds: vi.fn(() => []),
    update: vi.fn(),
    handleAuthorDeleted: vi.fn(),
    handleBookDeleted: vi.fn(),
  };
}

function fakeFetcher(items: ReturnType<typeof newImportListItemInfo>[]): IFetchAndParseImportList {
  return {
    fetch: vi.fn(async () => items),
    fetchSingleList: vi.fn(async () => items),
  };
}

function buildService(opts: {
  factory?: IImportListFactory;
  exclusionService?: IImportListExclusionService;
  fetcher?: IFetchAndParseImportList;
  bookService?: Partial<{
    findById: ReturnType<typeof vi.fn>;
    setBookMonitored: ReturnType<typeof vi.fn>;
    setMonitored: ReturnType<typeof vi.fn>;
  }>;
  authorService?: Partial<{
    findById: ReturnType<typeof vi.fn>;
    updateAuthor: ReturnType<typeof vi.fn>;
  }>;
  addAuthorService?: { addAuthors: ReturnType<typeof vi.fn> };
  addBookService?: { addBooks: ReturnType<typeof vi.fn> };
  commandQueueManager?: { push: ReturnType<typeof vi.fn> };
}) {
  const bookService = {
    findById: vi.fn(() => undefined),
    setBookMonitored: vi.fn(),
    setMonitored: vi.fn(),
    ...opts.bookService,
  };
  const authorService = {
    findById: vi.fn(() => undefined),
    updateAuthor: vi.fn(),
    ...opts.authorService,
  };
  const addAuthorService = opts.addAuthorService ?? { addAuthors: vi.fn(() => []) };
  const addBookService = opts.addBookService ?? { addBooks: vi.fn(() => []) };
  const commandQueueManager = opts.commandQueueManager ?? { push: vi.fn() };
  const eventAggregator = { publishEvent: vi.fn() };

  const service = new ImportListSyncService(
    opts.factory ?? fakeFactory(),
    opts.exclusionService ?? fakeExclusionService(),
    opts.fetcher ?? fakeFetcher([]),
    { getBookInfo: vi.fn() },
    { search: vi.fn(async () => []) },
    { getBookInfo: vi.fn() },
    authorService as never,
    bookService as never,
    { getEditionByForeignEditionId: vi.fn(() => undefined) } as never,
    addAuthorService,
    addBookService,
    eventAggregator,
    commandQueueManager as never
  );

  return {
    service,
    bookService,
    authorService,
    addAuthorService,
    addBookService,
    commandQueueManager,
    eventAggregator,
  };
}

function bookReport(overrides: Partial<ReturnType<typeof newImportListItemInfo>> = {}) {
  return {
    ...newImportListItemInfo(),
    importListId: 1,
    book: "The Way of Kings",
    bookGoodreadsId: "book-1",
    editionGoodreadsId: "edition-1",
    author: "Brandon Sanderson",
    authorGoodreadsId: "author-1",
    ...overrides,
  };
}

describe("ImportListSyncService", () => {
  it("execute() with no DefinitionId syncs all lists and publishes ImportListSyncCompleteEvent", async () => {
    const { service, eventAggregator } = buildService({ fetcher: fakeFetcher([]) });

    await service.execute(new ImportListSyncCommand());

    expect(eventAggregator.publishEvent).toHaveBeenCalledTimes(1);
  });

  it("execute() with a DefinitionId syncs only that list", async () => {
    const definition = createImportListDefinition({ id: 42, name: "SingleList" });
    const factory = fakeFactory(definition);
    const fetcher = fakeFetcher([]);
    const { service } = buildService({ factory, fetcher });

    await service.execute(new ImportListSyncCommand(42));

    expect(fetcher.fetchSingleList).toHaveBeenCalledWith(definition);
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it("rejects a book report whose BookGoodreadsId matches a list exclusion", async () => {
    const report = bookReport();
    const exclusionService = fakeExclusionService([{ foreignId: "book-1", name: "Excluded book" }]);
    const addBookService = { addBooks: vi.fn(() => []) };
    const { service } = buildService({
      fetcher: fakeFetcher([report]),
      exclusionService,
      addBookService,
    });

    await service.execute(new ImportListSyncCommand());

    expect(addBookService.addBooks).toHaveBeenCalledWith([], false);
  });

  it("rejects a book report whose AuthorGoodreadsId matches a list exclusion (parent-author exclusion)", async () => {
    const report = bookReport();
    const exclusionService = fakeExclusionService([
      { foreignId: "author-1", name: "Excluded author" },
    ]);
    const addBookService = { addBooks: vi.fn(() => []) };
    const { service } = buildService({
      fetcher: fakeFetcher([report]),
      exclusionService,
      addBookService,
    });

    await service.execute(new ImportListSyncCommand());

    expect(addBookService.addBooks).toHaveBeenCalledWith([], false);
  });

  it("an existing book with ShouldMonitorExisting=true and not yet monitored gets monitored + a targeted search queued", async () => {
    const definition = createImportListDefinition({
      id: 1,
      shouldMonitorExisting: true,
      shouldMonitor: ImportListMonitorType.SpecificBook,
    });
    const existingBook: Book = {
      ...newBook(),
      id: 55,
      monitored: false,
      author: { ...newAuthor(), id: 9, monitored: true, books: [] },
    };
    const bookService = {
      findById: vi.fn(() => existingBook),
      setBookMonitored: vi.fn(),
      setMonitored: vi.fn(),
    };
    const commandQueueManager = { push: vi.fn() };
    const { service } = buildService({
      factory: fakeFactory(definition),
      fetcher: fakeFetcher([bookReport()]),
      bookService,
      commandQueueManager,
    });

    await service.execute(new ImportListSyncCommand());

    expect(bookService.setBookMonitored).toHaveBeenCalledWith(55, true);
    expect(commandQueueManager.push).toHaveBeenCalled();
  });

  it("an existing book is NOT touched when ShouldMonitorExisting is false", async () => {
    const definition = createImportListDefinition({ id: 1, shouldMonitorExisting: false });
    const existingBook: Book = {
      ...newBook(),
      id: 55,
      monitored: false,
      author: { ...newAuthor(), id: 9 },
    };
    const bookService = {
      findById: vi.fn(() => existingBook),
      setBookMonitored: vi.fn(),
      setMonitored: vi.fn(),
    };
    const { service } = buildService({
      factory: fakeFactory(definition),
      fetcher: fakeFetcher([bookReport()]),
      bookService,
    });

    await service.execute(new ImportListSyncCommand());

    expect(bookService.setBookMonitored).not.toHaveBeenCalled();
  });

  it("a brand-new book with a brand-new author gets queued for AddBookService/AddAuthorService", async () => {
    const definition = createImportListDefinition({
      id: 1,
      shouldMonitor: ImportListMonitorType.EntireAuthor,
      shouldSearch: true,
      rootFolderPath: "/books",
      profileId: 3,
      metadataProfileId: 4,
    });
    const addAuthorService = {
      addAuthors: vi.fn((authors: Author[]) => authors.map((a, i) => ({ ...a, id: i + 100 }))),
    };
    const addBookService = { addBooks: vi.fn((books: Book[]) => books) };
    const { service } = buildService({
      factory: fakeFactory(definition),
      fetcher: fakeFetcher([bookReport()]),
      addAuthorService,
      addBookService,
    });

    await service.execute(new ImportListSyncCommand());

    expect(addAuthorService.addAuthors).toHaveBeenCalledTimes(1);
    const [authorsToAdd] = addAuthorService.addAuthors.mock.calls[0]!;
    expect(authorsToAdd).toHaveLength(1);
    expect(authorsToAdd[0].metadata.foreignAuthorId).toBe("author-1");
    expect(authorsToAdd[0].rootFolderPath).toBe("/books");
    expect(authorsToAdd[0].qualityProfileId).toBe(3);

    expect(addBookService.addBooks).toHaveBeenCalledTimes(1);
    const [booksToAdd] = addBookService.addBooks.mock.calls[0]!;
    expect(booksToAdd).toHaveLength(1);
    expect(booksToAdd[0].foreignBookId).toBe("book-1");
  });

  it("an author-only report (no book) for an excluded author is rejected", async () => {
    const report = {
      ...newImportListItemInfo(),
      importListId: 1,
      author: "Excluded Author",
      authorGoodreadsId: "author-x",
    };
    const exclusionService = fakeExclusionService([{ foreignId: "author-x", name: "Excluded" }]);
    const addAuthorService = { addAuthors: vi.fn(() => []) };
    const { service } = buildService({
      fetcher: fakeFetcher([report]),
      exclusionService,
      addAuthorService,
    });

    await service.execute(new ImportListSyncCommand());

    expect(addAuthorService.addAuthors).toHaveBeenCalledWith([], false);
  });

  it("an existing author (no book report) with ShouldMonitorExisting gets monitored", async () => {
    const definition = createImportListDefinition({ id: 1, shouldMonitorExisting: true });
    const report = {
      ...newImportListItemInfo(),
      importListId: 1,
      author: "Existing Author",
      authorGoodreadsId: "author-existing",
    };
    const existingAuthor: Author = { ...newAuthor(), id: 20, monitored: false };
    const authorService = { findById: vi.fn(() => existingAuthor), updateAuthor: vi.fn() };
    const { service } = buildService({
      factory: fakeFactory(definition),
      fetcher: fakeFetcher([report]),
      authorService,
    });

    await service.execute(new ImportListSyncCommand());

    expect(authorService.updateAuthor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 20, monitored: true })
    );
  });
});
