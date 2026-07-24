/**
 * Forward-referenced dependencies `ImportListSyncService` needs that belong
 * to modules genuinely out of this task's scope (ImportLists' core domain
 * module only -- see this module's final report for the full list and
 * why each one is deferred rather than ported here).
 *
 * Matches this port's established "narrow to the minimal interface actually
 * needed, document as forward-reference, let the owning module supersede
 * it later" convention (see e.g. `books/authorService.ts`'s doc comment on
 * `IBuildAuthorPaths`, or `indexers/indexerBase.ts`'s `IParsingService`).
 */

import { Command } from "../messaging/index.js";
import type { Author, Book } from "../books/models.js";

/**
 * Ported from NzbDrone.Core/Books/Services/AddAuthorService.cs's public
 * surface actually called by `ImportListSyncService`
 * (`IAddAuthorService.AddAuthors(List<Author>, bool)`). The real
 * `AddAuthorService` does path-building, metadata-profile validation, and
 * duplicate-detection beyond plain insertion (`books/authorService.ts`'s
 * `addAuthors` is the lower-level primitive it would call internally) --
 * porting the full add-workflow service is out of this task's scope (it
 * belongs to whichever future module owns "the author/book add workflow",
 * not ImportLists' own core domain).
 */
export interface IAddAuthorService {
  addAuthors(authors: Author[], doRefresh: boolean): Author[];
}

/**
 * Ported from NzbDrone.Core/Books/Services/AddBookService.cs's
 * `IAddBookService.AddBooks(List<Book>, bool)`. Same forward-reference
 * rationale as `IAddAuthorService` above.
 */
export interface IAddBookService {
  addBooks(books: Book[], doRefresh: boolean): Book[];
}

/**
 * Ported from NzbDrone.Core/MetadataSource/Goodreads/IGoodreadsProxy.cs's
 * `GetBookInfo(string)` member (the only one `ImportListSyncService`
 * actually calls). Per `docs/known-issues-fixlist.md` #1 and
 * `metadata-source/interfaces.ts`'s own scoping doc comment, the real
 * Goodreads metadata client was evaluated dead (Developer API closed to new
 * keys Dec 2020) and deliberately NOT ported -- this interface exists only
 * so `ImportListSyncService.mapBookReport()` can be ported with the same
 * call shape the real C# has, injectable with a no-op/throwing stub until
 * (if ever) a live implementation exists. See this module's final report
 * for the full cross-reference of every dead-Goodreads-touchpoint found in
 * this project's history.
 */
export interface IGoodreadsProxy {
  getBookInfo(editionGoodreadsId: string): Promise<{
    foreignBookId: string;
    title: string;
    authorForeignId: string;
    authorName: string;
  }>;
}

/**
 * Ported from NzbDrone.Core/MetadataSource/Goodreads/IGoodreadsSearchProxy.cs's
 * `Search(string)` member. Same dead-service rationale as `IGoodreadsProxy`
 * above -- this is Goodreads' free-text book/author search (distinct from
 * `ISearchForNewBook`/`ISearchForNewAuthor` in `metadata-source/interfaces.ts`,
 * which are satisfied by the three live replacement providers).
 */
export interface IGoodreadsSearchProxy {
  search(query: string): Promise<
    Array<{
      workId: string;
      bookId: string;
      bookTitleBare: string;
      author: { id: string; name: string };
    }>
  >;
}

/**
 * Ported from NzbDrone.Core/Books/Commands/BulkRefreshAuthorCommand.cs.
 * `Books/Commands/` is a sibling module to ImportLists, out of this task's
 * scope -- ported narrowly here as the real `Command` subclass shape
 * `ImportListSyncService.execute()` needs to actually push a well-typed
 * command onto `IManageCommandQueue`. A future port of `Books/Commands/`
 * itself should supersede this class (same import path convention as
 * `ImportListSyncCommand.ts` -- callers importing from THIS module's own
 * `forwardRefs.ts` would need updating to import the real one instead, the
 * same migration this port's other forward-ref seams already anticipate).
 */
export class BulkRefreshAuthorCommand extends Command {
  constructor(
    public authorIds: number[] = [],
    public areNewAuthors = false
  ) {
    super();
  }

  override get sendUpdatesToClient(): boolean {
    return true;
  }

  override get updateScheduledTask(): boolean {
    return false;
  }
}

/** Ported from NzbDrone.Core/IndexerSearch/BookSearchCommand.cs. Same forward-reference rationale as BulkRefreshAuthorCommand above. */
export class BookSearchCommand extends Command {
  constructor(public bookIds: number[] = []) {
    super();
  }

  override get sendUpdatesToClient(): boolean {
    return true;
  }
}

/** Ported from NzbDrone.Core/IndexerSearch/MissingBookSearchCommand.cs. Same forward-reference rationale as BulkRefreshAuthorCommand above. */
export class MissingBookSearchCommand extends Command {
  constructor(public authorId: number | null = null) {
    super();
  }

  override get sendUpdatesToClient(): boolean {
    return true;
  }
}
