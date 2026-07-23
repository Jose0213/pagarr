import type { Book } from "../books/models.js";
import type { IConfigService } from "../config/configService.js";
import type { IExtendedDiskProvider } from "./diskProvider.js";
import type { BookFile } from "./types.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/UpdateBookFileService.cs.
 *
 * FORWARD-REFERENCE DEVIATION: `Handle(AuthorScannedEvent message)` in the
 * real C# source calls `_bookService.GetAuthorBooksWithFiles(message.Author)`
 * and then reads each returned `Book.BookFiles.Value` (a `LazyLoaded<List
 * <BookFile>>`) to get every file for that author. This port's `bookService.
 * ts` (real, merged Books module) DOES have `getAuthorBooksWithFiles`
 * (see books/bookRepository.ts), but `Book` (books/models.ts) has no
 * `bookFiles` field -- BookFile is owned by the not-yet-merged
 * `media-files-import` module, so Books has no dependency on it (see
 * books/models.ts's own doc comment on the LazyLoaded convention: fields
 * outside a module's own dependency graph aren't declared on the shared
 * model). Rather than invent a fake `bookFiles` field on the real `Book`
 * type (out of this module's scope to modify), `handleAuthorScanned` below
 * takes the already-resolved `(book, files)` pairs as an explicit parameter
 * -- the caller (a future integration point once media-files-import lands)
 * is expected to call `bookService.getAuthorBooksWithFiles(author)` and
 * `mediaFileService.getFilesByBook(book.id)` per book itself and pass the
 * pairs in. This preserves the exact same iteration/update logic the C#
 * source has; only the "how do we get the book->files association" plumbing
 * moved to the caller.
 */
export interface IUpdateBookFileService {
  changeFileDateForFile(bookFile: BookFile, book: Book): void;
}

export class UpdateBookFileService implements IUpdateBookFileService {
  private static readonly EPOCH_TIME = new Date(Date.UTC(1970, 0, 1, 0, 0, 0));

  constructor(
    private readonly diskProvider: IExtendedDiskProvider,
    private readonly configService: IConfigService
  ) {}

  changeFileDateForFile(bookFile: BookFile, book: Book): void {
    this.changeFileDate(bookFile, book);
  }

  /**
   * Ported from the private `ChangeFileDate(BookFile bookFile, Book book)`.
   * Returns whether the date was actually changed, matching the C#
   * source's `bool` return (used by `Handle` to count how many files were
   * updated).
   */
  private changeFileDate(bookFile: BookFile, book: Book): boolean {
    const bookFilePath = bookFile.path;

    if (this.configService.fileDate !== "BookReleaseDate") {
      return false;
    }

    if (book.releaseDate === null || book.releaseDate === undefined) {
      return false;
    }

    let relDate = new Date(book.releaseDate);

    // Avoiding false +ve checks and set date skewing by not using UTC (Windows).
    const oldDateTime = this.diskProvider.fileGetLastWrite(bookFilePath);

    if (
      process.platform !== "win32" &&
      relDate.getTime() < UpdateBookFileService.EPOCH_TIME.getTime()
    ) {
      relDate = UpdateBookFileService.EPOCH_TIME;
    }

    if (relDate.getTime() !== oldDateTime.getTime()) {
      try {
        this.diskProvider.fileSetLastWriteTime(bookFilePath, relDate);
        return true;
      } catch {
        // Matches the C# source's catch-and-Warn-log wrapper.
        return false;
      }
    }

    return false;
  }

  /**
   * Ported from `Handle(AuthorScannedEvent message)`. See this class's
   * module doc comment on why `bookFiles` (per-book resolved file lists) is
   * an explicit parameter here rather than read off `Book.BookFiles.Value`.
   * Returns the count of updated files (the C# source only used this count
   * for a `_logger.ProgressDebug` call, which isn't ported -- see this
   * port's Instrumentation-not-ported convention -- so the return value
   * lets a caller reproduce that logging itself if desired).
   */
  handleAuthorScanned(books: { book: Book; files: BookFile[] }[]): {
    total: number;
    updated: number;
  } {
    if (this.configService.fileDate === "None") {
      return { total: 0, updated: 0 };
    }

    let total = 0;
    let updated = 0;

    for (const { book, files } of books) {
      for (const file of files) {
        total++;
        if (this.changeFileDate(file, book)) {
          updated++;
        }
      }
    }

    return { total, updated };
  }
}
