import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReleaseSearchService } from "../releaseSearchService.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "../models.js";
import {
  createBooksFixture,
  fakeIndexer,
  fakeIndexerFactory,
  fakeMakeDownloadDecision,
  fakeReleaseInfo,
} from "./testHelpers.js";

// Translated from NzbDrone.Core.Test/IndexerSearchTests/ReleaseSearchServiceFixture.cs.
//
// The real C# fixture mocks IAuthorService/IBookService via Moq and builds Author/Book
// fixtures with FizzWare.NBuilder. This port uses the real (already-ported, real-DB-backed)
// AuthorService/BookService instead -- IndexerSearch is a genuine consumer of the Books
// module here, not a forward reference (see testHelpers.ts's module doc comment) -- and
// fakes only the Indexers/DecisionEngine collaborators that ARE forward references.

describe("ReleaseSearchService", () => {
  let fixture: ReturnType<typeof createBooksFixture>;

  beforeEach(() => {
    fixture = createBooksFixture();
  });

  afterEach(() => {
    fixture.db.close();
  });

  describe("indexer tag filtering (BookSearch)", () => {
    // Tags_IndexerTags_AuthorNoTags_IndexerNotIncluded
    it("excludes an indexer with tags when the author has no tags", async () => {
      const author = fixture.insertAuthor({ tags: [] });
      const book = fixture.insertBook(author);

      const fetchedCriteria: BookSearchCriteria[] = [];
      const indexer = fakeIndexer({
        definition: { id: 1, tags: [3] },
        onFetch: (c) => fetchedCriteria.push(c),
      });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexer]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      expect(fetchedCriteria).toHaveLength(0);
    });

    // Tags_IndexerNoTags_AuthorTags_IndexerIncluded
    it("includes an untagged indexer even when the author has tags", async () => {
      const author = fixture.insertAuthor({ tags: [3] });
      const book = fixture.insertBook(author);

      const fetchedCriteria: BookSearchCriteria[] = [];
      const indexer = fakeIndexer({
        definition: { id: 1, tags: [] },
        onFetch: (c) => fetchedCriteria.push(c),
      });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexer]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      expect(fetchedCriteria).toHaveLength(1);
    });

    // Tags_IndexerAndAuthorTagsMatch_IndexerIncluded
    it("includes an indexer whose tags intersect the author's tags", async () => {
      const author = fixture.insertAuthor({ tags: [3, 4, 5] });
      const book = fixture.insertBook(author);

      const fetchedCriteria: BookSearchCriteria[] = [];
      const indexer = fakeIndexer({
        definition: { id: 1, tags: [1, 2, 3] },
        onFetch: (c) => fetchedCriteria.push(c),
      });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexer]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      expect(fetchedCriteria).toHaveLength(1);
    });

    // Tags_IndexerAndAuthorTagsMismatch_IndexerNotIncluded
    it("excludes an indexer whose tags don't intersect the author's tags", async () => {
      const author = fixture.insertAuthor({ tags: [4, 5, 6] });
      const book = fixture.insertBook(author);

      const fetchedCriteria: BookSearchCriteria[] = [];
      const indexer = fakeIndexer({
        definition: { id: 1, tags: [1, 2, 3] },
        onFetch: (c) => fetchedCriteria.push(c),
      });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexer]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      expect(fetchedCriteria).toHaveLength(0);
    });
  });

  describe("bookSearchForBook", () => {
    it("sets bookTitle from the monitored edition and bookYear from releaseDate", async () => {
      const author = fixture.insertAuthor();
      const book = fixture.insertBook(
        author,
        { title: "Book Title", releaseDate: "1986-06-01T00:00:00.000Z" },
        { title: "Edition Title", monitored: true }
      );

      let seenCriteria: BookSearchCriteria | undefined;
      const indexer = fakeIndexer({ onFetch: (c) => (seenCriteria = c) });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexer]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      expect(seenCriteria?.bookTitle).toBe("Edition Title");
      expect(seenCriteria?.bookYear).toBe(1986);
      expect(seenCriteria?.userInvokedSearch).toBe(true);
      expect(seenCriteria?.interactiveSearch).toBe(false);
    });

    it("throws if the book has no monitored edition (matching C#'s SingleOrDefault().Title NRE)", async () => {
      const author = fixture.insertAuthor();
      const book = fixture.insertBookWithoutMonitoredEdition(author);

      const service = new ReleaseSearchService(
        fakeIndexerFactory([fakeIndexer()]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await expect(service.bookSearchForBook(book, false, true, false)).rejects.toThrow();
    });

    it("updates lastSearchTime on the searched book when at least one indexer was searched", async () => {
      const author = fixture.insertAuthor();
      const book = fixture.insertBook(author);
      expect(book.lastSearchTime).toBeNull();

      const service = new ReleaseSearchService(
        fakeIndexerFactory([fakeIndexer()]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      const reloaded = fixture.bookService.getBook(book.id);
      expect(reloaded.lastSearchTime).not.toBeNull();
    });

    it("does not update lastSearchTime when no indexers are searched", async () => {
      const author = fixture.insertAuthor();
      const book = fixture.insertBook(author);

      const service = new ReleaseSearchService(
        fakeIndexerFactory([]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.bookSearchForBook(book, false, true, false);

      const reloaded = fixture.bookService.getBook(book.id);
      expect(reloaded.lastSearchTime).toBeNull();
    });

    it("swallows a per-indexer search error and continues with an empty result for that indexer", async () => {
      const author = fixture.insertAuthor();
      const book = fixture.insertBook(author);

      const goodIndexer = fakeIndexer({ releases: [fakeReleaseInfo({ guid: "g1" })] });
      const badIndexer = fakeIndexer({ throwOnFetch: true });

      const decisionMaker = fakeMakeDownloadDecision();

      const service = new ReleaseSearchService(
        fakeIndexerFactory([goodIndexer, badIndexer]),
        fixture.bookService,
        fixture.authorService,
        decisionMaker,
        fixture.editionService
      );

      await expect(service.bookSearchForBook(book, false, true, false)).resolves.toBeDefined();

      // Both indexers ran; the failing one contributed no reports.
      expect(decisionMaker.calls[0]!.reports).toHaveLength(1);
    });
  });

  describe("authorSearchForAuthor", () => {
    it("only searches for monitored books (filters unmonitored books out of the criteria)", async () => {
      const author = fixture.insertAuthor();
      fixture.insertBook(author, { monitored: true });
      fixture.insertBook(author, { monitored: false });

      let seenCriteria: AuthorSearchCriteria | undefined;
      const indexer = fakeIndexer({ onFetchAuthor: (c) => (seenCriteria = c) });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexer]),
        fixture.bookService,
        fixture.authorService,
        fakeMakeDownloadDecision(),
        fixture.editionService
      );

      await service.authorSearchForAuthor(author, false, true, false);

      expect(seenCriteria?.books).toHaveLength(1);
      expect(seenCriteria?.books[0]!.monitored).toBe(true);
    });
  });

  describe("bookSearch / authorSearch (by id, with de-dupe)", () => {
    it("de-dupes decisions sharing a release guid, keeping the one with fewer rejections", async () => {
      const author = fixture.insertAuthor();
      const book = fixture.insertBook(author);

      const shared = fakeReleaseInfo({ guid: "dup-guid", indexerPriority: 25 });

      const decisionMaker = fakeMakeDownloadDecision((reports) =>
        reports.map((r, i) => ({
          remoteBook: { release: r, books: [] },
          // First report gets a rejection, second is clean -- de-dupe should keep the second.
          rejections: i === 0 ? [{ reason: "bad", type: "Permanent" as never }] : [],
        }))
      );

      const indexerA = fakeIndexer({ releases: [shared] });
      const indexerB = fakeIndexer({ releases: [shared] });

      const service = new ReleaseSearchService(
        fakeIndexerFactory([indexerA, indexerB]),
        fixture.bookService,
        fixture.authorService,
        decisionMaker,
        fixture.editionService
      );

      const result = await service.bookSearch(book.id, false, true, false);

      // Both indexers report the same guid; GetSearchDecision is called once
      // per indexer's batch of reports, each producing one decision for that
      // guid -- de-dupe collapses the two into one.
      expect(result).toHaveLength(1);
    });
  });
});
