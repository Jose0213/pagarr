import type { Author, Book, Edition } from "../../../books/index.js";
import type { LocalEdition } from "../../../parser/model/localEdition.js";
import type { ISearchForNewBook } from "../../../metadata-source/interfaces.js";
import { MetadataProviderException } from "../../../metadata-source/errors.js";
import type { BookFile } from "../../bookFile.js";
import { newCandidateEdition, type CandidateEdition } from "./candidateEdition.js";
import { VARIOUS_AUTHOR_IDS, getAuthorVariants } from "./distanceCalculator.js";
import { isVariousAuthors } from "./trackGroupingService.js";
import { mostCommonKeyed } from "./enumerableExtensions.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/ImportDecisionMaker.cs's `IdentificationOverrides` (shared here + importDecisionMaker.ts to avoid a circular import). */
export interface IdentificationOverrides {
  author?: Author;
  book?: Book;
  edition?: Edition;
}

export interface AuthorLookup {
  /** Ported from IAuthorService.FindById(string foreignAuthorId). */
  findById(foreignAuthorId: string): Author | undefined;
  /** Ported from IAuthorService.GetCandidates(string authorTag). */
  getCandidates(authorTag: string): Author[];
}

export interface BookLookup {
  /** Ported from IBookService.GetCandidates(int authorMetadataId, string bookTag). */
  getCandidates(authorMetadataId: number, bookTag: string): Book[];
}

export interface EditionLookup {
  /** Ported from IEditionService.GetEditionsByBook(int bookId). */
  getEditionsByBook(bookId: number): Edition[];
  /** Ported from IEditionService.GetCandidates(int authorMetadataId, string bookTag). */
  getCandidates(authorMetadataId: number, bookTag: string): Edition[];
}

export interface MediaFileLookup {
  /** Ported from IMediaFileService.GetFilesByBook(int bookId). */
  getFilesByBook(bookId: number): BookFile[];
}

export interface ICandidateService {
  getDbCandidatesFromTags(
    localEdition: LocalEdition,
    idOverrides: IdentificationOverrides | null,
    includeExisting: boolean
  ): CandidateEdition[];
  getRemoteCandidates(
    localEdition: LocalEdition,
    idOverrides: IdentificationOverrides | null
  ): AsyncGenerator<CandidateEdition>;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Identification/CandidateService.cs.
 *
 * `GetRemoteCandidates` is a C# `IEnumerable<CandidateEdition>` iterator
 * method (`yield return`) whose body calls the async
 * `ISearchForNewBook`/`ISearchForNewAuthor` metadata-source methods
 * synchronously (Readarr's whole stack is synchronous). This port's
 * `ISearchForNewBook` (metadata-source module, already ported) is
 * Promise-based, so this is ported as an `async function*` async
 * generator -- same lazy yield-as-you-go semantics, awaited instead of
 * blocking. Callers (`IdentificationService`) iterate it with `for await`.
 *
 * `GoodreadsException` (Goodreads-specific) is NOT ported -- this port's
 * `ISearchForNewBook` throws `MetadataProviderException` (provider-agnostic,
 * see metadata-source/errors.ts's doc comment) for the equivalent "the
 * provider failed" case, caught here in its place. `SearchByGoodreadsBookId`
 * is ported as `searchByForeignEditionId` -- see metadata-source/
 * interfaces.ts's doc comment on `ISearchForNewBook`.
 */
export class CandidateService implements ICandidateService {
  constructor(
    private readonly bookSearchService: ISearchForNewBook,
    private readonly authorService: AuthorLookup,
    private readonly bookService: BookLookup,
    private readonly editionService: EditionLookup,
    private readonly mediaFileService: MediaFileLookup
  ) {}

  getDbCandidatesFromTags(
    localEdition: LocalEdition,
    idOverrides: IdentificationOverrides | null,
    includeExisting: boolean
  ): CandidateEdition[] {
    // Generally author, book and release are null.  But if they're not then limit candidates appropriately.
    // We've tried to make sure that tracks are all for a single release.

    // if we have a Book ID, use that.
    // TODO: select by ISBN? (ported verbatim -- the C# source's
    // ReleaseMBId/tagMbidRelease lookup path is commented out in the real
    // source too, preserved as dead code intentionally, not implemented.)
    // Typed `Book | null` (not narrowed to bare `null`) so the branches
    // below -- faithfully preserved from the always-null C# source --
    // still type-check against a real `Book`'s fields.
    const tagMbidRelease = null as Book | null;
    const tagCandidate = null as CandidateEdition[] | null;

    let candidateReleases: CandidateEdition[];

    if (idOverrides?.edition !== undefined) {
      const release = idOverrides.edition;
      candidateReleases = this.getDbCandidatesByEdition([release], includeExisting);
    } else if (idOverrides?.book !== undefined) {
      // use the release from file tags if it exists and agrees with the specified book
      if (tagMbidRelease?.id === idOverrides.book.id) {
        candidateReleases = tagCandidate ?? [];
      } else {
        candidateReleases = this.getDbCandidatesByBook(idOverrides.book, includeExisting);
      }
    } else if (idOverrides?.author !== undefined) {
      // use the release from file tags if it exists and agrees with the specified book
      if (tagMbidRelease?.authorMetadataId === idOverrides.author.authorMetadataId) {
        candidateReleases = tagCandidate ?? [];
      } else {
        candidateReleases = this.getDbCandidatesByAuthor(
          localEdition,
          idOverrides.author,
          includeExisting
        );
      }
    } else {
      if (tagMbidRelease !== null) {
        candidateReleases = tagCandidate ?? [];
      } else {
        candidateReleases = this.getDbCandidates(localEdition, includeExisting);
      }
    }

    return candidateReleases;
  }

  private getDbCandidatesByEdition(
    editions: Edition[],
    includeExisting: boolean
  ): CandidateEdition[] {
    // get the local tracks on disk for each book
    const bookIds = [...new Set(editions.map((x) => x.bookId))];
    const bookFiles = new Map<number, BookFile[]>(
      bookIds.map((id) => [id, includeExisting ? this.mediaFileService.getFilesByBook(id) : []])
    );

    return editions.map((x) => newCandidateEdition(x, bookFiles.get(x.bookId) ?? []));
  }

  private getDbCandidatesByBook(book: Book, includeExisting: boolean): CandidateEdition[] {
    // Sort by most voted so less likely to swap to a random release
    const editions = this.editionService
      .getEditionsByBook(book.id)
      .slice()
      .sort((a, b) => popularity(b) - popularity(a));
    return this.getDbCandidatesByEdition(editions, includeExisting);
  }

  private getDbCandidatesByAuthor(
    localEdition: LocalEdition,
    author: Author,
    includeExisting: boolean
  ): CandidateEdition[] {
    const candidateReleases: CandidateEdition[] = [];

    const bookTag =
      mostCommonKeyed(
        localEdition.localBooks.map((x) => x.fileTrackInfo?.bookTitle ?? ""),
        (v) => v
      ) ?? "";

    if (bookTag.trim() !== "") {
      const possibleBooks = this.bookService.getCandidates(author.authorMetadataId, bookTag);
      for (const book of possibleBooks) {
        candidateReleases.push(...this.getDbCandidatesByBook(book, includeExisting));
      }

      const possibleEditions = this.editionService.getCandidates(author.authorMetadataId, bookTag);
      candidateReleases.push(...this.getDbCandidatesByEdition(possibleEditions, includeExisting));
    }

    return candidateReleases;
  }

  private getDbCandidates(
    localEdition: LocalEdition,
    includeExisting: boolean
  ): CandidateEdition[] {
    // most general version, nothing has been specified.
    // get all plausible authors, then all plausible books, then get releases for each of these.
    const candidateReleases: CandidateEdition[] = [];

    // check if it looks like VA.
    if (isVariousAuthors(localEdition.localBooks)) {
      const va = this.authorService.findById(VARIOUS_AUTHOR_IDS[0]!);
      if (va !== undefined) {
        candidateReleases.push(...this.getDbCandidatesByAuthor(localEdition, va, includeExisting));
      }
    }

    const authorTags =
      mostCommonKeyed(
        localEdition.localBooks.map((x) => x.fileTrackInfo?.authors ?? []),
        (v) => v.join(" ")
      ) ?? [];

    if (authorTags.length > 0) {
      const variants = getAuthorVariants(authorTags.filter((x) => x.trim() !== ""));

      for (const authorTag of variants) {
        if (authorTag.trim() !== "") {
          const possibleAuthors = this.authorService.getCandidates(authorTag);
          for (const author of possibleAuthors) {
            candidateReleases.push(
              ...this.getDbCandidatesByAuthor(localEdition, author, includeExisting)
            );
          }
        }
      }
    }

    return candidateReleases;
  }

  async *getRemoteCandidates(
    localEdition: LocalEdition,
    idOverrides: IdentificationOverrides | null
  ): AsyncGenerator<CandidateEdition> {
    const seenCandidates = new Set<string>();

    const isbns = [...new Set(localEdition.localBooks.map((x) => x.fileTrackInfo?.isbn ?? null))];
    const asins = [...new Set(localEdition.localBooks.map((x) => x.fileTrackInfo?.asin ?? null))];
    const goodreads = [
      ...new Set(localEdition.localBooks.map((x) => x.fileTrackInfo?.goodreadsId ?? null)),
    ];

    // grab possibilities for all the IDs present
    if (isbns.length === 1 && isNotBlank(isbns[0])) {
      let remoteBooks: Book[];
      try {
        remoteBooks = await this.bookSearchService.searchByIsbn(isbns[0]);
      } catch (e) {
        if (e instanceof MetadataProviderException) {
          remoteBooks = [];
        } else {
          throw e;
        }
      }

      for (const candidate of toCandidates(remoteBooks, seenCandidates, idOverrides)) {
        yield candidate;
      }
    }

    if (asins.length === 1 && isNotBlank(asins[0]) && asins[0].length === 10) {
      let remoteBooks: Book[];
      try {
        remoteBooks = await this.bookSearchService.searchByAsin(asins[0]);
      } catch (e) {
        if (e instanceof MetadataProviderException) {
          remoteBooks = [];
        } else {
          throw e;
        }
      }

      for (const candidate of toCandidates(remoteBooks, seenCandidates, idOverrides)) {
        yield candidate;
      }
    }

    if (goodreads.length === 1 && isNotBlank(goodreads[0])) {
      let remoteBooks: Book[];
      try {
        remoteBooks = await this.bookSearchService.searchByForeignEditionId(goodreads[0], true);
      } catch (e) {
        if (e instanceof MetadataProviderException) {
          remoteBooks = [];
        } else {
          throw e;
        }
      }

      for (const candidate of toCandidates(remoteBooks, seenCandidates, idOverrides)) {
        yield candidate;
      }
    }

    // If we got an id result, or any overrides are set, stop
    if (
      seenCandidates.size > 0 ||
      idOverrides?.edition !== undefined ||
      idOverrides?.book !== undefined ||
      idOverrides?.author !== undefined
    ) {
      return;
    }

    // fall back to author / book name search
    const authorTags: string[] = [];

    if (isVariousAuthors(localEdition.localBooks)) {
      authorTags.push("Various Authors");
    } else {
      // the most common list of authors reported by a file
      const authors =
        mostCommonKeyed(
          localEdition.localBooks.map((x) =>
            (x.fileTrackInfo?.authors ?? []).filter((a) => a.trim() !== "")
          ),
          (v) => v.join(" ")
        ) ?? [];
      authorTags.push(...authors);
    }

    const bookTag =
      mostCommonKeyed(
        localEdition.localBooks.map((x) => x.fileTrackInfo?.bookTitle ?? ""),
        (v) => v
      ) ?? "";

    // If no valid author or book tags, stop
    if (authorTags.length === 0 || bookTag.trim() === "") {
      return;
    }

    // Search by author+book
    for (const authorTag of authorTags) {
      let remoteBooks: Book[];
      try {
        remoteBooks = await this.bookSearchService.searchForNewBook(bookTag, authorTag);
      } catch (e) {
        if (e instanceof MetadataProviderException) {
          remoteBooks = [];
        } else {
          throw e;
        }
      }

      for (const candidate of toCandidates(remoteBooks, seenCandidates, idOverrides)) {
        yield candidate;
      }
    }

    // If we got an author/book search result, stop
    if (seenCandidates.size > 0) {
      return;
    }

    // Search by just book title
    let byTitleOnly: Book[];
    try {
      byTitleOnly = await this.bookSearchService.searchForNewBook(bookTag, null);
    } catch (e) {
      if (e instanceof MetadataProviderException) {
        byTitleOnly = [];
      } else {
        throw e;
      }
    }

    for (const candidate of toCandidates(byTitleOnly, seenCandidates, idOverrides)) {
      yield candidate;
    }

    // Search by just author
    for (const a of authorTags) {
      let remoteBooks: Book[];
      try {
        remoteBooks = await this.bookSearchService.searchForNewBook(a, null);
      } catch (e) {
        if (e instanceof MetadataProviderException) {
          remoteBooks = [];
        } else {
          throw e;
        }
      }

      for (const candidate of toCandidates(remoteBooks, seenCandidates, idOverrides)) {
        yield candidate;
      }
    }
  }
}

function toCandidates(
  books: Book[],
  seenCandidates: Set<string>,
  idOverrides: IdentificationOverrides | null
): CandidateEdition[] {
  const candidates: CandidateEdition[] = [];

  for (const book of books) {
    // We have to make sure various bits and pieces are populated that are normally handled
    // by a database lazy load
    for (const edition of book.editions ?? []) {
      edition.book = book;

      if (
        !seenCandidates.has(edition.foreignEditionId) &&
        satisfiesOverride(edition, idOverrides)
      ) {
        seenCandidates.add(edition.foreignEditionId);
        candidates.push(newCandidateEdition(edition, []));
      }
    }
  }

  return candidates;
}

function satisfiesOverride(edition: Edition, idOverride: IdentificationOverrides | null): boolean {
  if (idOverride?.edition !== undefined) {
    return edition.foreignEditionId === idOverride.edition.foreignEditionId;
  }

  if (idOverride?.book !== undefined) {
    return edition.book?.foreignBookId === idOverride.book.foreignBookId;
  }

  if (idOverride?.author !== undefined) {
    return edition.book?.author?.id === idOverride.author.id;
  }

  return true;
}

function isNotBlank(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

/** Ported from `Ratings.Popularity => (double)Value * Votes`, applied here to Edition.ratings (same shape as Book.ratings). */
function popularity(edition: Edition): number {
  return edition.ratings.value * edition.ratings.votes;
}
