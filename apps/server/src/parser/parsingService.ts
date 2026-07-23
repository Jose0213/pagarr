import type { Author, AuthorService, Book, BookService, EditionService } from "../books/index.js";
import { cleanAuthorName, parseBookTitle, parseBookTitleWithSearchCriteria } from "./parser.js";
import { fuzzyMatchScore } from "./stringMatching.js";
import type { ParsedBookInfo } from "./model/parsedBookInfo.js";
import { newRemoteBook, type RemoteBook } from "./model/remoteBook.js";

/**
 * Ported from NzbDrone.Core/Parser/ParsingService.cs.
 *
 * ## Deviations
 *
 * - `SearchCriteriaBase`/`BookSearchCriteria` (`NzbDrone.Core.IndexerSearch.
 *   Definitions`) are Phase 2 `IndexerSearch` types not yet ported in this
 *   worktree. `Map`/`GetBooks` only ever read `.author`/`.books` off the
 *   passed-in criteria object (never any of `BookSearchCriteria`'s own
 *   fields), so a narrow local `SearchCriteria` interface capturing just
 *   that shape stands in here -- same "inject the missing piece narrowly"
 *   pattern as `books/textMatching.ts`'s `ITextMatcher` seam. When
 *   IndexerSearch lands, `BookSearchCriteria` should satisfy this same
 *   shape structurally (TS structural typing means no explicit
 *   `implements` is even required).
 * - `IMediaFileService.GetFilesByAuthor` (`NzbDrone.Core.MediaFiles`,
 *   Phase 3) backs `GetLocalBook` -- not ported yet, so `getLocalBook`
 *   takes a `getFilesByAuthor` callback parameter instead of a
 *   constructor-injected `IMediaFileService`, matching `authorService.ts`'s
 *   `updateAuthors`/`buildPath` callback-parameter pattern for the same
 *   kind of not-yet-ported dependency.
 * - No NLog `Logger` (see monitorNewBookService.ts's doc comment for why);
 *   `_logger.Debug(...)` calls are dropped, not replaced.
 * - `Parser.CleanAuthorName`/`Parser.ParseBookTitle`/
 *   `Parser.ParseBookTitleWithSearchCriteria` are the REAL functions from
 *   `parser.ts` in this same module (not a forward-reference or a
 *   `ITextMatcher`-style seam) -- ParsingService is Parser's own real
 *   caller in the C# source.
 */

/** Narrow stand-in for `NzbDrone.Core.IndexerSearch.Definitions.SearchCriteriaBase` -- see module doc comment. */
export interface SearchCriteria {
  author: Author;
  books: Book[];
}

/** Ported from `MediaFiles.TrackFile`'s narrow shape `GetLocalBook` actually reads -- see module doc comment re: IMediaFileService. */
export interface AuthorFile {
  path: string;
  editionId: number;
}

export class ParsingService {
  constructor(
    private readonly authorService: AuthorService,
    private readonly bookService: BookService,
    private readonly editionService: EditionService
  ) {}

  /** Ported from `ParsingService.GetAuthor(string title)`. */
  getAuthor(title: string): Author | undefined {
    const parsedBookInfo = parseBookTitle(title);

    const lookupTitle =
      parsedBookInfo !== null && parsedBookInfo.authorName.trim() !== ""
        ? parsedBookInfo.authorName
        : title;

    let authorInfo = this.authorService.findByName(lookupTitle);

    if (authorInfo === undefined) {
      authorInfo = this.authorService.findByNameInexact(lookupTitle);
    }

    return authorInfo;
  }

  /** Ported from `ParsingService.Map(ParsedBookInfo parsedBookInfo, SearchCriteriaBase searchCriteria = null)`. */
  map(parsedBookInfo: ParsedBookInfo, searchCriteria: SearchCriteria | null = null): RemoteBook {
    const remoteBook = newRemoteBook();
    remoteBook.parsedBookInfo = parsedBookInfo;

    const author = this.getAuthorForParsedInfo(parsedBookInfo, searchCriteria);

    if (author === undefined) {
      return remoteBook;
    }

    remoteBook.author = author;
    remoteBook.books = this.getBooks(parsedBookInfo, author, searchCriteria);

    return remoteBook;
  }

  /** Ported from `ParsingService.Map(ParsedBookInfo parsedBookInfo, int authorId, IEnumerable<int> bookIds)`. */
  mapByIds(parsedBookInfo: ParsedBookInfo, authorId: number, bookIds: number[]): RemoteBook {
    const remoteBook = newRemoteBook();
    remoteBook.parsedBookInfo = parsedBookInfo;
    remoteBook.author = this.authorService.getAuthor(authorId);
    remoteBook.books = this.bookService.getBooks(bookIds);
    return remoteBook;
  }

  /** Ported from `ParsingService.GetBooks(ParsedBookInfo parsedBookInfo, Author author, SearchCriteriaBase searchCriteria = null)`. */
  getBooks(
    parsedBookInfo: ParsedBookInfo,
    author: Author,
    searchCriteria: SearchCriteria | null = null
  ): Book[] {
    const bookTitle = parsedBookInfo.bookTitle;

    if (parsedBookInfo.bookTitle === null) {
      return [];
    }

    if (parsedBookInfo.discography) {
      if (parsedBookInfo.discographyStart > 0) {
        return this.bookService.authorBooksBetweenDates(
          author,
          new Date(Date.UTC(parsedBookInfo.discographyStart, 0, 1)).toISOString(),
          new Date(Date.UTC(parsedBookInfo.discographyEnd, 11, 31)).toISOString(),
          false
        );
      }

      if (parsedBookInfo.discographyEnd > 0) {
        return this.bookService.authorBooksBetweenDates(
          author,
          new Date(Date.UTC(1800, 0, 1)).toISOString(),
          new Date(Date.UTC(parsedBookInfo.discographyEnd, 11, 31)).toISOString(),
          false
        );
      }

      return this.bookService.getBooksByAuthor(author.id);
    }

    let bookInfo: Book | undefined;

    if (searchCriteria !== null) {
      const cleanTitle = cleanAuthorName(parsedBookInfo.bookTitle);
      bookInfo = exclusiveOrDefault(
        searchCriteria.books,
        (e) => e.title === bookTitle || e.cleanTitle === cleanTitle
      );
    }

    if (bookInfo === undefined) {
      // TODO: Search by Title and Year instead of just Title when matching
      bookInfo = this.bookService.findByTitle(author.authorMetadataId, parsedBookInfo.bookTitle);
    }

    if (bookInfo === undefined) {
      const edition = this.editionService.findByTitle(
        author.authorMetadataId,
        parsedBookInfo.bookTitle
      );
      bookInfo = edition?.book;
    }

    if (bookInfo === undefined) {
      bookInfo = this.bookService.findByTitleInexact(
        author.authorMetadataId,
        parsedBookInfo.bookTitle
      );
    }

    if (bookInfo === undefined) {
      const edition = this.editionService.findByTitleInexact(
        author.authorMetadataId,
        parsedBookInfo.bookTitle
      );
      bookInfo = edition?.book;
    }

    return bookInfo !== undefined ? [bookInfo] : [];
  }

  private getAuthorForParsedInfo(
    parsedBookInfo: ParsedBookInfo,
    searchCriteria: SearchCriteria | null
  ): Author | undefined {
    if (searchCriteria !== null) {
      if (searchCriteria.author.cleanName === cleanAuthorName(parsedBookInfo.authorName)) {
        return searchCriteria.author;
      }
    }

    let author = this.authorService.findByName(parsedBookInfo.authorName);

    if (author === undefined) {
      author = this.authorService.findByNameInexact(parsedBookInfo.authorName);
    }

    return author;
  }

  /** Ported from `ParsingService.ParseBookTitleFuzzy(string title)`. */
  parseBookTitleFuzzy(title: string): ParsedBookInfo | null {
    let bestScore = 0.0;

    let bestAuthor: Author | null = null;
    let bestBook: Book | null = null;

    const possibleAuthors = this.authorService.getReportCandidates(title);

    for (const author of possibleAuthors) {
      const authorMatch = fuzzyMatchScore(title, author.metadata?.name ?? "");
      const possibleBooks = this.bookService.getCandidates(author.authorMetadataId, title);

      for (const book of possibleBooks) {
        const bookMatch = fuzzyMatchScore(title, book.title);
        const score = (authorMatch + bookMatch) / 2;

        if (score > bestScore) {
          bestScore = score;
          bestAuthor = author;
          bestBook = book;
        }
      }

      const possibleEditions = this.editionService.getCandidates(author.authorMetadataId, title);
      for (const edition of possibleEditions) {
        const editionMatch = fuzzyMatchScore(title, edition.title);
        const score = (authorMatch + editionMatch) / 2;

        if (score > bestScore) {
          bestScore = score;
          bestAuthor = author;
          bestBook = edition.book ?? null;
        }
      }
    }

    if (bestAuthor !== null && bestBook !== null) {
      return parseBookTitleWithSearchCriteria(title, bestAuthor, [bestBook]);
    }

    return null;
  }

  /**
   * Ported from `ParsingService.GetLocalBook(string filename, Author
   * author)`. Takes `getFilesByAuthor` as a parameter rather than a
   * constructor-injected `IMediaFileService` -- see module doc comment.
   */
  getLocalBook(
    filename: string,
    author: Author,
    getFilesByAuthor: (authorId: number) => AuthorFile[]
  ): Book | undefined {
    const directory = hasExtension(filename) ? dirname(filename) : filename;

    const tracksInBook = distinctByEditionId(
      getFilesByAuthor(author.id).filter((f) => dirname(f.path) === directory)
    );

    return tracksInBook.length === 1
      ? this.bookService.getBook(tracksInBook[0]!.editionId)
      : undefined;
  }
}

/**
 * Ported from `IEnumerableExtensions.ExclusiveOrDefault<TSource>(this
 * IEnumerable<TSource> source, Func<TSource, bool> predicate)`: returns the
 * single matching element only if EXACTLY ONE element matches -- if two or
 * more match, returns `undefined` (NOT the first match), same as C#'s
 * `default(TSource)` fallback. This is intentionally different from
 * `Array.prototype.find`, which returns the *first* match regardless of
 * how many exist.
 */
function exclusiveOrDefault<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  const matches: T[] = [];
  for (const item of items) {
    if (predicate(item)) {
      matches.push(item);
      if (matches.length > 2) {
        break;
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function hasExtension(filename: string): boolean {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0;
}

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.substring(0, idx);
}

function distinctByEditionId(files: AuthorFile[]): AuthorFile[] {
  const seen = new Set<number>();
  const result: AuthorFile[] = [];
  for (const f of files) {
    if (!seen.has(f.editionId)) {
      seen.add(f.editionId);
      result.push(f);
    }
  }
  return result;
}
