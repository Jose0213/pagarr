import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bookSearchCommand,
  cutoffUnmetBookSearchCommand,
  missingBookSearchCommand,
} from "../bookSearchService.js";
import type { DownloadDecision } from "../collaborators.js";
import type { ISearchForReleases } from "../releaseSearchService.js";
import {
  createBooksFixture,
  fakeBookCutoffService,
  fakeProcessDownloadDecisions,
  fakeQueueService,
  fakeReleaseInfo,
} from "./testHelpers.js";

// Translated from NzbDrone.Core/IndexerSearch/BookSearchService.cs's three Execute()
// overloads. No direct C# unit-test fixture exists for BookSearchService in the reference
// source (AuthorSearchServiceFixture/ReleaseSearchServiceFixture are the only IndexerSearch
// fixtures) -- these are new tests covering the three command handlers' actual behavior.

function fakeReleaseSearchService(
  decisionsByBookId: Map<number, DownloadDecision[]> = new Map()
): ISearchForReleases & { bookSearchCalls: Array<[number, boolean, boolean, boolean]> } {
  const bookSearchCalls: Array<[number, boolean, boolean, boolean]> = [];
  return {
    bookSearchCalls,
    async bookSearch(bookId, missingOnly, userInvokedSearch, interactiveSearch) {
      bookSearchCalls.push([bookId, missingOnly, userInvokedSearch, interactiveSearch]);
      return decisionsByBookId.get(bookId) ?? [];
    },
    async authorSearch() {
      return [];
    },
  };
}

function fakeThrowingReleaseSearchService(
  failingBookId: number
): ISearchForReleases & { calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    async bookSearch(bookId) {
      calls.push(bookId);
      if (bookId === failingBookId) {
        throw new Error("search failed");
      }
      return [];
    },
    async authorSearch() {
      return [];
    },
  };
}

describe("bookSearchCommand", () => {
  it("searches and processes decisions for every requested book id", async () => {
    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await bookSearchCommand(releaseSearchService, processDownloadDecisions, [1, 2, 3], true);

    expect(releaseSearchService.bookSearchCalls).toEqual([
      [1, false, true, false],
      [2, false, true, false],
      [3, false, true, false],
    ]);
    expect(processDownloadDecisions.calls).toHaveLength(3);
  });

  it("passes userInvokedSearch through unchanged", async () => {
    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await bookSearchCommand(releaseSearchService, processDownloadDecisions, [5], false);

    expect(releaseSearchService.bookSearchCalls[0]![2]).toBe(false);
  });
});

describe("missingBookSearchCommand", () => {
  let fixture: ReturnType<typeof createBooksFixture>;

  beforeEach(() => {
    fixture = createBooksFixture();
  });

  afterEach(() => {
    fixture.db.close();
  });

  it("searches every book missing files across all authors when no authorId is given", async () => {
    const author1 = fixture.insertAuthor();
    const author2 = fixture.insertAuthor();
    const book1 = fixture.insertBook(author1);
    const book2 = fixture.insertBook(author2);

    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await missingBookSearchCommand(
      releaseSearchService,
      fixture.bookService,
      fakeQueueService([]),
      processDownloadDecisions,
      undefined,
      true
    );

    const searchedIds = releaseSearchService.bookSearchCalls.map((c) => c[0]).sort();
    expect(searchedIds).toEqual([book1.id, book2.id].sort());
  });

  it("filters to the given author's books when authorId is provided", async () => {
    const author1 = fixture.insertAuthor();
    const author2 = fixture.insertAuthor();
    const book1 = fixture.insertBook(author1);
    fixture.insertBook(author2);

    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await missingBookSearchCommand(
      releaseSearchService,
      fixture.bookService,
      fakeQueueService([]),
      processDownloadDecisions,
      author1.id,
      true
    );

    expect(releaseSearchService.bookSearchCalls.map((c) => c[0])).toEqual([book1.id]);
  });

  it("excludes books already present in the queue", async () => {
    const author = fixture.insertAuthor();
    const book1 = fixture.insertBook(author);
    const book2 = fixture.insertBook(author);

    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await missingBookSearchCommand(
      releaseSearchService,
      fixture.bookService,
      fakeQueueService([{ book: book1 }]),
      processDownloadDecisions,
      undefined,
      true
    );

    expect(releaseSearchService.bookSearchCalls.map((c) => c[0])).toEqual([book2.id]);
  });

  it("continues past a per-book search error and still searches the remaining books", async () => {
    const author = fixture.insertAuthor();
    const book1 = fixture.insertBook(author);
    const book2 = fixture.insertBook(author);

    const releaseSearchService = fakeThrowingReleaseSearchService(book1.id);
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await missingBookSearchCommand(
      releaseSearchService,
      fixture.bookService,
      fakeQueueService([]),
      processDownloadDecisions,
      undefined,
      true
    );

    expect(releaseSearchService.calls.sort()).toEqual([book1.id, book2.id].sort());
    // Only book2's decisions (empty) made it to ProcessDecisions -- book1's search failure
    // was swallowed and skipped, matching BookSearchService.SearchForBulkBooks's try/catch.
    expect(processDownloadDecisions.calls).toHaveLength(1);
  });
});

describe("cutoffUnmetBookSearchCommand", () => {
  let fixture: ReturnType<typeof createBooksFixture>;

  beforeEach(() => {
    fixture = createBooksFixture();
  });

  afterEach(() => {
    fixture.db.close();
  });

  it("searches every book returned by the cutoff-unmet lookup", async () => {
    const author = fixture.insertAuthor();
    const book1 = fixture.insertBook(author);
    const book2 = fixture.insertBook(author);

    const releaseSearchService = fakeReleaseSearchService(
      new Map([
        [book1.id, [{ remoteBook: { release: fakeReleaseInfo(), books: [] }, rejections: [] }]],
      ])
    );
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await cutoffUnmetBookSearchCommand(
      releaseSearchService,
      fakeBookCutoffService([book1, book2]),
      fakeQueueService([]),
      processDownloadDecisions,
      true
    );

    expect(releaseSearchService.bookSearchCalls.map((c) => c[0]).sort()).toEqual(
      [book1.id, book2.id].sort()
    );
  });

  it("excludes books already present in the queue", async () => {
    const author = fixture.insertAuthor();
    const book1 = fixture.insertBook(author);
    const book2 = fixture.insertBook(author);

    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await cutoffUnmetBookSearchCommand(
      releaseSearchService,
      fakeBookCutoffService([book1, book2]),
      fakeQueueService([{ book: book2 }]),
      processDownloadDecisions,
      true
    );

    expect(releaseSearchService.bookSearchCalls.map((c) => c[0])).toEqual([book1.id]);
  });
});
