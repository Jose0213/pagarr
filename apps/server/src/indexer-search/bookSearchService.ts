/**
 * Ported from NzbDrone.Core/IndexerSearch/BookSearchService.cs +
 * BookSearchCommand.cs + MissingBookSearchCommand.cs +
 * CutoffUnmetBookSearchCommand.cs.
 *
 * ## Deviations
 *
 * - Same Command/IExecute/CommandTrigger deviation as authorSearchService.ts
 *   -- each `Execute(TCommand)` overload is ported as a plain async
 *   function taking the command's real fields directly (`bookIds`,
 *   `authorId?`, `userInvokedSearch`) instead of a dispatchable Command
 *   object. See authorSearchService.ts's module doc comment for the
 *   precedent this follows.
 * - No NLog `Logger` (same precedent as releaseSearchService.ts).
 * - `IBookCutoffService` and `IQueueService` are forward-referenced --
 *   see collaborators.ts's module doc comment for exactly why (in
 *   IBookCutoffService's case: its one real implementation depends on a
 *   BookRepository method that the already-merged Books module explicitly
 *   didn't port, for reasons outside this module's control).
 * - The C# class implements three `IExecute<T>` overloads on one
 *   `internal class BookSearchService`; ported here as three separate
 *   exported functions (`bookSearchCommand`, `missingBookSearchCommand`,
 *   `cutoffUnmetBookSearchCommand`) sharing the private `searchForBulkBooks`
 *   helper, since there's no command-bus class to hang multiple `Execute`
 *   overloads off of.
 */

import type { BookService } from "../books/bookService.js";
import type { Book } from "../books/models.js";
import { PagingSpec, SortDirection } from "../db/paging-spec.js";
import type {
  IBookCutoffServiceLike,
  IProcessDownloadDecisionsLike,
  IQueueServiceLike,
} from "./collaborators.js";
import type { ISearchForReleases } from "./releaseSearchService.js";

/**
 * Ported from BookSearchService.SearchForBulkBooks(List<Book> books, bool
 * userInvokedSearch): searches each book in ascending LastSearchTime order
 * (nulls first, via DateTime.MinValue), continuing past per-book search
 * errors, and tallies how many were grabbed.
 */
async function searchForBulkBooks(
  releaseSearchService: ISearchForReleases,
  processDownloadDecisions: IProcessDownloadDecisionsLike,
  books: Book[],
  userInvokedSearch: boolean
): Promise<number> {
  let downloadedCount = 0;

  const ordered = [...books].sort((a, b) => {
    const aTime = a.lastSearchTime ? Date.parse(a.lastSearchTime) : Number.MIN_SAFE_INTEGER;
    const bTime = b.lastSearchTime ? Date.parse(b.lastSearchTime) : Number.MIN_SAFE_INTEGER;
    return aTime - bTime;
  });

  for (const book of ordered) {
    let decisions;

    try {
      decisions = await releaseSearchService.bookSearch(book.id, false, userInvokedSearch, false);
    } catch {
      // C#: _logger.Error(ex, "Unable to search for book: [{0}]", book) -- no Logger here, see module doc comment.
      continue;
    }

    const processed = await processDownloadDecisions.processDecisions(decisions);

    downloadedCount += processed.grabbed.length;
  }

  return downloadedCount;
}

/** Ported from BookSearchService.Execute(BookSearchCommand message). */
export async function bookSearchCommand(
  releaseSearchService: ISearchForReleases,
  processDownloadDecisions: IProcessDownloadDecisionsLike,
  bookIds: number[],
  userInvokedSearch: boolean
): Promise<void> {
  for (const bookId of bookIds) {
    const decisions = await releaseSearchService.bookSearch(
      bookId,
      false,
      userInvokedSearch,
      false
    );
    await processDownloadDecisions.processDecisions(decisions);
    // C#: _logger.ProgressInfo("Book search completed. {0} reports downloaded.", processed.Grabbed.Count) -- no Logger here, see module doc comment.
  }
}

/**
 * Builds the same PagingSpec<Book> shape the real
 * MissingBookSearchCommand/CutoffUnmetBookSearchCommand handlers construct
 * (Page 1, PageSize 100000, ascending by Id, filtered to monitored books).
 *
 * DEVIATION: the real C# filter is
 * `v.Monitored == true && v.Author.Value.Monitored == true` -- a predicate
 * spanning both Books and the joined Authors row. This port's
 * `FilterExpression<Book>` (db/filter.ts) is typed to `Book`'s own columns
 * only (`field: keyof Book & string`), so the `Author.Monitored` half is
 * structurally unrepresentable here. This is moot in practice for the two
 * callers below anyway: `bookRepository.booksWithoutFiles` (already merged,
 * outside this module's scope) doesn't read `pagingSpec.filterExpressions`
 * at all -- see that file's module doc comment and this module's own
 * report for the underlying gap -- so only the `Book.monitored` condition
 * is set here, matching what's actually representable, and left for
 * whoever wires a real filter-capable query layer through
 * booksWithoutFiles/booksWhereCutoffUnmet to complete.
 */
function monitoredBooksPagingSpec(): PagingSpec<Book> {
  const pagingSpec = new PagingSpec<Book>();
  pagingSpec.page = 1;
  pagingSpec.pageSize = 100000;
  pagingSpec.sortDirection = SortDirection.Ascending;
  // C#: SortKey = "Id" (Dapper/BasicRepository column-name convention).
  // This port's BookRepository.columnForSortKey (bookRepository.ts) keys
  // its SORT_COLUMN_MAP by the camelCase TS field name instead ("id" ->
  // "Id"), matching every other ported PagingSpec call site's sortKey
  // convention -- not a deviation specific to this module.
  pagingSpec.sortKey = "id";
  pagingSpec.filterExpressions.push({ field: "monitored", op: "eq", value: true });
  return pagingSpec;
}

/** Ported from BookSearchService.Execute(MissingBookSearchCommand message). */
export async function missingBookSearchCommand(
  releaseSearchService: ISearchForReleases,
  bookService: BookService,
  queueService: IQueueServiceLike,
  processDownloadDecisions: IProcessDownloadDecisionsLike,
  authorId: number | undefined,
  userInvokedSearch: boolean
): Promise<void> {
  const pagingSpec = monitoredBooksPagingSpec();

  let books = bookService.booksWithoutFiles(pagingSpec).records;

  if (authorId !== undefined) {
    // C#: books.Where(e => e.AuthorId.Equals(authorId)), where Book.AuthorId
    // is the compat getter for the joined Authors.Id (see
    // releaseSearchService.ts's bookSearchForBook doc comment for the same
    // AuthorId-vs-AuthorMetadataId distinction). booksWithoutFiles's result
    // rows don't carry a hydrated `author` relation here to read that off
    // of directly, so this intersects against bookService.getBooksByAuthor
    // (the same Books-JOIN-Authors-on-Id query GetBooksByAuthor always
    // uses) to get the equivalent by-author-identity narrowing.
    const authorBookIds = new Set(bookService.getBooksByAuthor(authorId).map((b) => b.id));
    books = books.filter((b) => authorBookIds.has(b.id));
  }

  const queue = queueService.getQueue();
  const queuedBookIds = new Set(queue.filter((q) => q.book !== null).map((q) => q.book!.id));
  const missing = books.filter((b) => !queuedBookIds.has(b.id));

  await searchForBulkBooks(
    releaseSearchService,
    processDownloadDecisions,
    missing,
    userInvokedSearch
  );
}

/** Ported from BookSearchService.Execute(CutoffUnmetBookSearchCommand message). */
export async function cutoffUnmetBookSearchCommand(
  releaseSearchService: ISearchForReleases,
  bookCutoffService: IBookCutoffServiceLike,
  queueService: IQueueServiceLike,
  processDownloadDecisions: IProcessDownloadDecisionsLike,
  userInvokedSearch: boolean
): Promise<void> {
  const pagingSpec = monitoredBooksPagingSpec();

  const books = bookCutoffService.booksWhereCutoffUnmet(pagingSpec).records;

  const queue = queueService.getQueue();
  const queuedBookIds = new Set(queue.filter((q) => q.book !== null).map((q) => q.book!.id));
  const cutoffUnmet = books.filter((b) => !queuedBookIds.has(b.id));

  await searchForBulkBooks(
    releaseSearchService,
    processDownloadDecisions,
    cutoffUnmet,
    userInvokedSearch
  );
}
