import type { IConfigService } from "../config/configService.js";
import { ReleaseSourceType } from "../parser/model/releaseInfo.js";
import type { DownloadFailedEvent } from "./events.js";

/**
 * Ported from NzbDrone.Core/Download/RedownloadFailedDownloadService.cs.
 *
 * DEVIATIONS:
 *  - `IBookService.GetBooksByAuthor(authorId)` -- narrowed to
 *    `{ getBooksByAuthor(authorId): { id: number }[] }`, matching
 *    `books/bookService.ts`'s real `BookService.getBooksByAuthor` shape
 *    (a real dependency, injected narrowly since only `.length`/ids are
 *    read here).
 *  - `IManageCommandQueue.Push(new BookSearchCommand(...))` /
 *    `Push(new AuthorSearchCommand{...})` -- Messaging/Jobs (Phase 4) isn't
 *    ported; ported as two optional callbacks
 *    (`searchBooks`/`searchAuthor`), matching this port's established
 *    "Messaging not ported yet, use a callback seam" convention
 *    (root-folders/root-folder-service.ts). The real IndexerSearch module's
 *    `bookSearchCommand`/`authorSearchCommand`-equivalent functions (see
 *    `indexer-search/bookSearchService.ts`/`authorSearchService.ts`) are
 *    the real targets these callbacks should invoke once wired up by a
 *    caller with access to both modules.
 *  - `[EventHandleOrder(EventHandleOrder.Last)]` -- an ordering hint for
 *    the not-yet-ported Messaging event dispatcher; has no equivalent here
 *    since there's no dispatcher to order against yet. Noted for whoever
 *    wires this handler up for real.
 *  - No NLog Logger -- per this port's no-NLog-yet convention.
 */
export interface BookCountLookup {
  getBooksByAuthor(authorId: number): { id: number }[];
}

export interface RedownloadFailedDownloadServiceDeps {
  searchBooks?: (bookIds: number[]) => void;
  searchAuthor?: (authorId: number) => void;
}

export class RedownloadFailedDownloadService {
  private readonly searchBooks: (bookIds: number[]) => void;
  private readonly searchAuthor: (authorId: number) => void;

  constructor(
    private readonly configService: IConfigService,
    private readonly bookService: BookCountLookup,
    deps: RedownloadFailedDownloadServiceDeps = {}
  ) {
    this.searchBooks = deps.searchBooks ?? (() => {});
    this.searchAuthor = deps.searchAuthor ?? (() => {});
  }

  /** Ported from `Handle(DownloadFailedEvent message)` -- `[EventHandleOrder(EventHandleOrder.Last)]`, see class doc comment. */
  handle(message: DownloadFailedEvent): void {
    if (message.skipRedownload) {
      return;
    }

    if (!this.configService.autoRedownloadFailed) {
      return;
    }

    if (
      message.releaseSource === ReleaseSourceType.InteractiveSearch &&
      !this.configService.autoRedownloadFailedFromInteractiveSearch
    ) {
      return;
    }

    if (message.bookIds.length === 1) {
      this.searchBooks(message.bookIds);
      return;
    }

    const booksInAuthor = this.bookService.getBooksByAuthor(message.authorId);

    if (message.bookIds.length === booksInAuthor.length) {
      this.searchAuthor(message.authorId);
      return;
    }

    this.searchBooks(message.bookIds);
  }
}
