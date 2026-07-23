/**
 * Shared test helpers for the IndexerSearch module's tests: a real-DB-backed
 * AuthorService/BookService pair (following books/__tests__/testDb.ts's
 * established pattern) plus fakes for the forward-referenced Indexers/
 * Parser/DecisionEngine/Download/Queue collaborators (see
 * ../collaborators.ts's module doc comment for why those are forward
 * references rather than real imports).
 */

import { AuthorMetadataRepository } from "../../books/authorMetadataRepository.js";
import { AuthorRepository } from "../../books/authorRepository.js";
import { AuthorService } from "../../books/authorService.js";
import { BookRepository } from "../../books/bookRepository.js";
import { BookService } from "../../books/bookService.js";
import { EditionRepository } from "../../books/editionRepository.js";
import { EditionService } from "../../books/editionService.js";
import type { IBooksEventAggregator, BooksDomainEvent } from "../../books/events.js";
import {
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  type Author,
  type AuthorMetadata,
  type Book,
  type Edition,
} from "../../books/models.js";
import { NullTextMatcher } from "../../books/textMatching.js";
import {
  createMainDatabase,
  DEFAULT_MAIN_MIGRATIONS_DIR,
  type MainDatabase,
} from "../../db/db-factory.js";
import type {
  DownloadDecision,
  IBookCutoffServiceLike,
  IIndexerFactoryLike,
  IIndexerLike,
  IMakeDownloadDecisionLike,
  IProcessDownloadDecisionsLike,
  IQueueServiceLike,
  IndexerDefinitionLike,
  ProcessedDecisions,
  QueueItemLike,
  ReleaseInfo,
} from "../collaborators.js";
import type { AuthorSearchCriteria, BookSearchCriteria, SearchCriteriaBase } from "../models.js";
import { PagingSpec } from "../../db/paging-spec.js";

export class CapturingEventAggregator implements IBooksEventAggregator {
  events: BooksDomainEvent[] = [];
  publishEvent(event: BooksDomainEvent): void {
    this.events.push(event);
  }
}

/** Real-DB-backed Books module wiring, for tests that need genuine AuthorService/BookService behavior (matching this repo's established books/__tests__ pattern rather than mocking the module IndexerSearch is a real consumer of). */
export function createBooksFixture() {
  const db: MainDatabase = createMainDatabase(":memory:", DEFAULT_MAIN_MIGRATIONS_DIR);
  const authorRepo = new AuthorRepository(db);
  const metaRepo = new AuthorMetadataRepository(db);
  const bookRepo = new BookRepository(db);
  const editionRepo = new EditionRepository(db);
  const events = new CapturingEventAggregator();
  const matcher = new NullTextMatcher();
  const editionService = new EditionService(editionRepo, events, matcher);
  const authorService = new AuthorService(authorRepo, events, matcher);
  const bookService = new BookService(bookRepo, editionService, events, matcher);

  function insertAuthor(
    overrides: Partial<Author> = {},
    metaOverrides: Partial<AuthorMetadata> = {}
  ): Author {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: overrides.id ? `fa-${overrides.id}` : `fa-${Math.random()}`,
      titleSlug: `slug-${Math.random()}`,
      name: "Author",
      ...metaOverrides,
    });

    return authorRepo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: "author",
      path: "/books/author",
      monitored: true,
      tags: [],
      ...overrides,
    });
  }

  function insertBook(
    author: Author,
    overrides: Partial<Book> = {},
    editionOverrides: Partial<Edition> = {}
  ): Book {
    const book = bookService.addBook({
      ...newBook(),
      authorMetadataId: author.authorMetadataId,
      foreignBookId: `fb-${Math.random()}`,
      titleSlug: `book-slug-${Math.random()}`,
      title: "Book",
      cleanTitle: "book",
      monitored: true,
      // BookRepository.booksWithoutFiles filters `"Books"."ReleaseDate" <=
      // ?` (now) -- NULL fails that comparison in SQLite, so a released-in-
      // the-past date is needed by default for missingBookSearchCommand
      // tests to see these rows; overrides can still set releaseDate: null
      // explicitly where a test wants that excluded.
      releaseDate: "2000-01-01T00:00:00.000Z",
      editions: [
        {
          ...newEdition(),
          id: 0,
          foreignEditionId: `fe-${Math.random()}`,
          titleSlug: `ed-slug-${Math.random()}`,
          title: "Book",
          monitored: true,
          ...editionOverrides,
        },
      ],
      ...overrides,
    });
    // bookService.getBook()/BasicRepository.get() never populates the
    // lazy `editions` relation (see books/models.ts's module doc comment) --
    // populate it explicitly here the same way a real caller would, since
    // releaseSearchService.bookSearchForBook needs book.editions to find
    // the monitored edition's title.
    const stored = bookService.getBook(book.id);
    stored.editions = editionRepo.findByBook([book.id]);
    return stored;
  }

  /**
   * Inserts a book with no monitored edition. `bookService.addBook`
   * (bookService.ts) always forces exactly one edition monitored --
   * `editions.find(e => e.monitored) ?? editions[0]`, then
   * `editionService.setMonitored(...)` -- so passing `monitored: false` for
   * a book's only edition via `insertBook` above still ends up monitored
   * (it's the `?? editions[0]` fallback). This helper inserts normally,
   * then force-unmonitors the edition directly through the repository,
   * bypassing that fallback to reach the state the "no monitored edition"
   * test needs.
   */
  function insertBookWithoutMonitoredEdition(author: Author): Book {
    const book = insertBook(author);
    const unmonitored = book.editions!.map((e) => ({ ...e, monitored: false }));
    editionRepo.updateMany(unmonitored);
    book.editions = unmonitored;
    return book;
  }

  return {
    db,
    authorService,
    bookService,
    editionService,
    authorRepo,
    bookRepo,
    editionRepo,
    insertAuthor,
    insertBook,
    insertBookWithoutMonitoredEdition,
  };
}

/** Ported from IndexerDefinition -- see collaborators.ts. */
export function fakeIndexerDefinition(
  overrides: Partial<IndexerDefinitionLike> = {}
): IndexerDefinitionLike {
  return { id: 1, tags: [], ...overrides };
}

export interface FakeIndexerOptions {
  definition?: Partial<IndexerDefinitionLike>;
  releases?: ReleaseInfo[];
  onFetch?: (criteria: BookSearchCriteria) => void;
  onFetchAuthor?: (criteria: AuthorSearchCriteria) => void;
  throwOnFetch?: boolean;
}

/** A minimal fake IIndexerLike -- see collaborators.ts's IIndexerLike doc comment for the narrowed real-interface shape this satisfies. */
export function fakeIndexer(options: FakeIndexerOptions = {}): IIndexerLike {
  const releases = options.releases ?? [];
  return {
    definition: fakeIndexerDefinition(options.definition),
    async fetch(criteria: BookSearchCriteria): Promise<ReleaseInfo[]> {
      options.onFetch?.(criteria);
      if (options.throwOnFetch) {
        throw new Error("indexer failure");
      }
      return releases;
    },
    async fetchAuthor(criteria: AuthorSearchCriteria): Promise<ReleaseInfo[]> {
      options.onFetchAuthor?.(criteria);
      if (options.throwOnFetch) {
        throw new Error("indexer failure");
      }
      return releases;
    },
  };
}

/** A fake IIndexerFactoryLike returning the same indexer list for both automatic and interactive search, mirroring the C# test fixtures' AutomaticSearchEnabled(true) setup. */
export function fakeIndexerFactory(indexers: IIndexerLike[]): IIndexerFactoryLike {
  return {
    automaticSearchEnabled: () => indexers,
    interactiveSearchEnabled: () => indexers,
  };
}

/** A fake IMakeDownloadDecisionLike that records the criteria it was called with and returns a caller-supplied decision list (default: one no-op decision per report). */
export function fakeMakeDownloadDecision(
  build?: (reports: ReleaseInfo[], criteria: SearchCriteriaBase) => DownloadDecision[]
): IMakeDownloadDecisionLike & {
  calls: Array<{ reports: ReleaseInfo[]; criteria: SearchCriteriaBase }>;
} {
  const calls: Array<{ reports: ReleaseInfo[]; criteria: SearchCriteriaBase }> = [];
  return {
    calls,
    getSearchDecision(reports: ReleaseInfo[], criteria: SearchCriteriaBase): DownloadDecision[] {
      calls.push({ reports, criteria });
      if (build) {
        return build(reports, criteria);
      }
      return reports.map((r) => ({ remoteBook: { release: r, books: [] }, rejections: [] }));
    },
  };
}

export function fakeReleaseInfo(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    guid: `guid-${Math.random()}`,
    title: "Release",
    indexerId: 1,
    indexerPriority: 25,
    ...overrides,
  };
}

/** A fake IProcessDownloadDecisionsLike that just reports everything as grabbed (or a caller-supplied result). */
export function fakeProcessDownloadDecisions(
  result?: (decisions: DownloadDecision[]) => ProcessedDecisions
): IProcessDownloadDecisionsLike & { calls: DownloadDecision[][] } {
  const calls: DownloadDecision[][] = [];
  return {
    calls,
    async processDecisions(decisions: DownloadDecision[]): Promise<ProcessedDecisions> {
      calls.push(decisions);
      if (result) {
        return result(decisions);
      }
      return { grabbed: decisions, pending: [], rejected: [] };
    },
  };
}

export function fakeQueueService(items: QueueItemLike[] = []): IQueueServiceLike {
  return { getQueue: () => items };
}

export function fakeBookCutoffService(books: Book[] = []): IBookCutoffServiceLike {
  return {
    booksWhereCutoffUnmet(pagingSpec: PagingSpec<Book>): PagingSpec<Book> {
      pagingSpec.records = books;
      pagingSpec.totalRecords = books.length;
      return pagingSpec;
    },
  };
}
