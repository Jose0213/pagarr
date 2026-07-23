/**
 * Ported from NzbDrone.Core/IndexerSearch/ReleaseSearchService.cs.
 *
 * ## Deviations
 *
 * - Collaborators from Indexers/Parser/DecisionEngine (`IIndexer`,
 *   `IIndexerFactory`, `ReleaseInfo`, `DownloadDecision`,
 *   `IMakeDownloadDecision`) are forward-referenced structural interfaces
 *   -- see collaborators.ts's module doc comment for the full list and
 *   why.
 * - `IAuthorService`/`IBookService` are the real ported Books module
 *   (`../books/authorService.js`/`bookService.js`) -- Books is a Phase 1
 *   module already merged, a real consumer relationship, not a forward
 *   reference.
 * - Extra `EditionService` constructor parameter (NOT present on the real
 *   C# `ReleaseSearchService(IIndexerFactory, IBookService, IAuthorService,
 *   IMakeDownloadDecision, Logger)`). In C#, `Book.Editions` is a
 *   `LazyLoaded<List<Edition>>` that transparently fetches itself from the
 *   DB the moment `.Value` is touched (`book.Editions.Value.SingleOrDefault
 *   (x => x.Monitored).Title` in the real `BookSearch(Book, ...)`) -- no
 *   separate service call needed. This port's `BookService.getBook()`
 *   never populates `book.editions` (see books/models.ts's module doc
 *   comment on dropping LazyLoaded; books/bookRepository.ts's `get()` is
 *   the plain `BasicRepository` CRUD method, no join), and that gap can't
 *   be closed from inside this module (it would mean editing
 *   books/bookRepository.ts, outside this module's allowed scope). Rather
 *   than silently returning wrong/empty search criteria whenever a caller
 *   passes a bare `getBook()` result, `bookSearchForBook` hydrates
 *   `book.editions` itself via the injected `EditionService` when it's
 *   missing -- matching this repo's "inject the missing piece narrowly"
 *   precedent (see authorService.ts's `updateAuthors` taking a `buildPath`
 *   callback for the same kind of reason).
 * - No NLog `Logger` constructor param (matching this repo's established
 *   "drop NLog, no Instrumentation module yet" precedent -- see
 *   books/authorService.ts's module doc comment). `_logger.ProgressInfo`/
 *   `ProgressDebug`/`Error`/`Debug` calls are dropped; nothing here depends
 *   on them for correctness.
 * - `Task<T>` -> `Promise<T>`; `Func<IIndexer, Task<IList<ReleaseInfo>>>`
 *   (the `searchAction` delegate passed into `Dispatch`) -> a plain TS
 *   function type `(indexer: IIndexerLike) => Promise<ReleaseInfo[]>`.
 */

import type { AuthorService } from "../books/authorService.js";
import type { BookService } from "../books/bookService.js";
import type { EditionService } from "../books/editionService.js";
import type { Author, Book } from "../books/models.js";
import {
  type DownloadDecision,
  type IIndexerFactoryLike,
  type IIndexerLike,
  type IMakeDownloadDecisionLike,
  INDEXER_DEFAULT_PRIORITY,
  type ReleaseInfo,
} from "./collaborators.js";
import type { AuthorSearchCriteria, BookSearchCriteria, SearchCriteriaBase } from "./models.js";

/** Ported from ISearchForReleases (the interface ReleaseSearchService implements). */
export interface ISearchForReleases {
  bookSearch(
    bookId: number,
    missingOnly: boolean,
    userInvokedSearch: boolean,
    interactiveSearch: boolean
  ): Promise<DownloadDecision[]>;
  authorSearch(
    authorId: number,
    missingOnly: boolean,
    userInvokedSearch: boolean,
    interactiveSearch: boolean
  ): Promise<DownloadDecision[]>;
}

export class ReleaseSearchService implements ISearchForReleases {
  constructor(
    private readonly indexerFactory: IIndexerFactoryLike,
    private readonly bookService: BookService,
    private readonly authorService: AuthorService,
    private readonly makeDownloadDecision: IMakeDownloadDecisionLike,
    private readonly editionService: EditionService
  ) {}

  /** Ported from ReleaseSearchService.BookSearch(int bookId, bool missingOnly, bool userInvokedSearch, bool interactiveSearch). */
  async bookSearch(
    bookId: number,
    missingOnly: boolean,
    userInvokedSearch: boolean,
    interactiveSearch: boolean
  ): Promise<DownloadDecision[]> {
    const downloadDecisions: DownloadDecision[] = [];

    const book = this.bookService.getBook(bookId);

    const decisions = await this.bookSearchForBook(
      book,
      missingOnly,
      userInvokedSearch,
      interactiveSearch
    );
    downloadDecisions.push(...decisions);

    return this.deDupeDecisions(downloadDecisions);
  }

  /** Ported from ReleaseSearchService.AuthorSearch(int authorId, bool missingOnly, bool userInvokedSearch, bool interactiveSearch). */
  async authorSearch(
    authorId: number,
    missingOnly: boolean,
    userInvokedSearch: boolean,
    interactiveSearch: boolean
  ): Promise<DownloadDecision[]> {
    const downloadDecisions: DownloadDecision[] = [];

    const author = this.authorService.getAuthor(authorId);

    const decisions = await this.authorSearchForAuthor(
      author,
      missingOnly,
      userInvokedSearch,
      interactiveSearch
    );
    downloadDecisions.push(...decisions);

    return this.deDupeDecisions(downloadDecisions);
  }

  /**
   * Ported from ReleaseSearchService.AuthorSearch(Author author, bool
   * missingOnly, bool userInvokedSearch, bool interactiveSearch) -- the
   * internal overload taking a hydrated Author. `missingOnly` is accepted
   * for signature fidelity with the C# overload but unused there too (the
   * real method never reads it either -- ported as-is, not a TS-side
   * omission).
   */
  async authorSearchForAuthor(
    author: Author,
    _missingOnly: boolean,
    userInvokedSearch: boolean,
    interactiveSearch: boolean
  ): Promise<DownloadDecision[]> {
    const searchSpec = getAuthorCriteria(author, userInvokedSearch, interactiveSearch);
    let books = this.bookService.getBooksByAuthor(author.id);

    books = books.filter((b) => b.monitored);

    searchSpec.books = books;

    return this.dispatch((indexer) => indexer.fetchAuthor(searchSpec), searchSpec);
  }

  /**
   * Ported from ReleaseSearchService.BookSearch(Book book, bool
   * missingOnly, bool userInvokedSearch, bool interactiveSearch) -- the
   * internal overload taking a hydrated Book. `missingOnly` is likewise
   * accepted-but-unused, matching the C# original.
   */
  async bookSearchForBook(
    book: Book,
    _missingOnly: boolean,
    userInvokedSearch: boolean,
    interactiveSearch: boolean
  ): Promise<DownloadDecision[]> {
    // C#: _authorService.GetAuthor(book.AuthorId), where Book.AuthorId is a
    // compatibility getter for `Author.Value.Id` (the lazy-loaded Author
    // relation's Authors.Id -- NOT AuthorMetadataId; see Book.cs's
    // "compatibility properties" region). This port's Book has no
    // lazy-loaded `author` populated by a bare getBook() call (see
    // books/models.ts's module doc comment on dropping LazyLoaded), so the
    // equivalent lookup goes through AuthorMetadataId -> the same
    // underlying Authors row via getAuthorByMetadataId, which is how every
    // other ported Books call site resolves this relation.
    const author = this.authorService.getAuthorByMetadataId(book.authorMetadataId);
    if (!author) {
      throw new Error(
        `Author not found for book ${book.id} (authorMetadataId=${book.authorMetadataId})`
      );
    }

    const searchSpec = getBookCriteria(author, [book], userInvokedSearch, interactiveSearch);

    // book.editions is the LazyLoaded<List<Edition>> stand-in -- hydrate it
    // via EditionService if the caller passed a bare (un-hydrated) Book.
    // See this module's doc comment on the EditionService constructor
    // parameter for why this is needed here.
    const editions = book.editions ?? this.editionService.getEditionsByBook(book.id);

    const monitoredEdition = editions.find((e) => e.monitored);
    // C#: book.Editions.Value.SingleOrDefault(x => x.Monitored).Title --
    // SingleOrDefault throws NullReferenceException reading .Title if no
    // edition is monitored (there is no null-check in the original). Ported
    // faithfully: this throws too if there's no monitored edition.
    if (!monitoredEdition) {
      throw new Error("Sequence contains no matching element");
    }
    searchSpec.bookTitle = monitoredEdition.title;

    // searchSpec.BookIsbn = book.Isbn13;
    if (book.releaseDate) {
      searchSpec.bookYear = new Date(book.releaseDate).getUTCFullYear();
    }

    return this.dispatch((indexer) => indexer.fetch(searchSpec), searchSpec);
  }

  /**
   * Ported from ReleaseSearchService.Dispatch(Func<IIndexer,
   * Task<IList<ReleaseInfo>>> searchAction, SearchCriteriaBase
   * criteriaBase).
   */
  private async dispatch(
    searchAction: (indexer: IIndexerLike) => Promise<ReleaseInfo[]>,
    criteriaBase: SearchCriteriaBase
  ): Promise<DownloadDecision[]> {
    let indexers = criteriaBase.interactiveSearch
      ? this.indexerFactory.interactiveSearchEnabled()
      : this.indexerFactory.automaticSearchEnabled();

    // Filter indexers to untagged indexers and indexers with intersecting tags
    indexers = indexers.filter(
      (i) =>
        i.definition.tags.length === 0 ||
        i.definition.tags.some((tag) => criteriaBase.author.tags.includes(tag))
    );

    const batch = await Promise.all(
      indexers.map((indexer) => this.dispatchIndexer(searchAction, indexer))
    );

    const reports = batch.flat();

    // Update the last search time for all books if at least 1 indexer was searched.
    if (indexers.length > 0) {
      const lastSearchTime = new Date().toISOString();

      for (const b of criteriaBase.books) {
        b.lastSearchTime = lastSearchTime;
      }
      this.bookService.updateLastSearchTime(criteriaBase.books);
    }

    return this.makeDownloadDecision.getSearchDecision(reports, criteriaBase);
  }

  /** Ported from ReleaseSearchService.DispatchIndexer(...): swallows per-indexer errors, returning an empty result for that indexer. */
  private async dispatchIndexer(
    searchAction: (indexer: IIndexerLike) => Promise<ReleaseInfo[]>,
    indexer: IIndexerLike
  ): Promise<ReleaseInfo[]> {
    try {
      return await searchAction(indexer);
    } catch {
      // C#: _logger.Error(ex, "Error while searching for {0}", criteriaBase) -- no Logger here, see module doc comment.
      return [];
    }
  }

  /**
   * Ported from ReleaseSearchService.DeDupeDecisions(List<DownloadDecision>
   * decisions): de-dupes by release guid, keeping the decision with the
   * fewest rejections, then (tie-break) the higher indexer priority (lower
   * number = higher priority, matching IndexerDefinition.DefaultPriority's
   * "priority" semantics).
   */
  private deDupeDecisions(decisions: DownloadDecision[]): DownloadDecision[] {
    const byGuid = new Map<string, DownloadDecision[]>();

    for (const decision of decisions) {
      const guid = decision.remoteBook.release.guid;
      const group = byGuid.get(guid);
      if (group) {
        group.push(decision);
      } else {
        byGuid.set(guid, [decision]);
      }
    }

    const result: DownloadDecision[] = [];
    for (const group of byGuid.values()) {
      const sorted = [...group].sort((a, b) => {
        const rejectionDiff = a.rejections.length - b.rejections.length;
        if (rejectionDiff !== 0) {
          return rejectionDiff;
        }
        const aPriority = a.remoteBook?.release?.indexerPriority ?? INDEXER_DEFAULT_PRIORITY;
        const bPriority = b.remoteBook?.release?.indexerPriority ?? INDEXER_DEFAULT_PRIORITY;
        return aPriority - bPriority;
      });
      result.push(sorted[0]!);
    }

    return result;
  }
}

/** Ported from ReleaseSearchService's private generic `Get<TSpec>(Author author, List<Book> books, bool userInvokedSearch, bool interactiveSearch)` overload, specialized to BookSearchCriteria. */
function getBookCriteria(
  author: Author,
  books: Book[],
  userInvokedSearch: boolean,
  interactiveSearch: boolean
): BookSearchCriteria {
  return {
    monitoredBooksOnly: false,
    userInvokedSearch,
    interactiveSearch,
    author,
    books,
    bookTitle: "",
    bookYear: 0,
  };
}

/** Ported from ReleaseSearchService's private static `Get<TSpec>(Author author, bool userInvokedSearch, bool interactiveSearch)` overload, specialized to AuthorSearchCriteria. */
function getAuthorCriteria(
  author: Author,
  userInvokedSearch: boolean,
  interactiveSearch: boolean
): AuthorSearchCriteria {
  return {
    monitoredBooksOnly: false,
    userInvokedSearch,
    interactiveSearch,
    author,
    books: [],
  };
}
