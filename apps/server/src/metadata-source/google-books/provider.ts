/**
 * Google Books provider: implements the interfaces ported in
 * ../interfaces.ts against the real Google Books API v1
 * (https://developers.google.com/books/docs/v1/using). One of three
 * providers that together replace Readarr's single bookinfo.club/Goodreads
 * dependency -- see ../interfaces.ts's module doc comment and
 * known-issues-fixlist.md #1.
 *
 * Cannot be live-tested in this sandboxed environment (no network access)
 * -- structurally correct against Google's documented Volume resource
 * shape (developers.google.com/books/docs/v1/reference/volumes).
 *
 * ## Weakest of the three providers by design -- read before wiring priority order
 *
 * Google Books has no author entity (see google-books/types.ts's module
 * doc comment) and no work/edition grouping -- `getAuthorInfo` therefore
 * can only return a bare Author assembled from a name-search match (no
 * bio/photo/bibliography the way Hardcover/OpenLibrary return), and
 * `getBookInfo` returns exactly one edition per foreign id (the Volume
 * itself), never a multi-edition Book the way the other two providers do.
 * This provider is included as a THIRD independent fallback specifically
 * because it's operated by Google at Google's infrastructure scale --
 * different failure domain from Hardcover (small team, beta API, 60
 * req/min) and OpenLibrary (nonprofit, best-effort uptime) -- not because
 * its data is the richest. See ../priorityMetadataService.ts for how
 * fallback order should weigh this.
 */

import { newAuthor, type Author, type AuthorMetadata, type Book } from "../../books/models.js";
import type { ITextMatcher } from "../../books/textMatching.js";
import { NullTextMatcher } from "../../books/textMatching.js";
import type { IHttpClient } from "../../http/index.js";
import type { BookInfoResult, MetadataProvider, NewEntitySearchResult } from "../interfaces.js";
import { AuthorNotFoundException, BookNotFoundException } from "../errors.js";
import { mapAuthorMetadata, mapBook, getPrimaryAuthorId } from "../mapper.js";
import { MetadataRequestBuilder } from "../metadataRequestBuilder.js";
import {
  GOOGLE_BOOKS_DEFAULT_BASE_URL,
  GoogleBooksClient,
  type GoogleBooksClientOptions,
} from "./client.js";
import { authorForeignId, toAuthorResourceDto, toWorkResourceDto } from "./mapper.js";
import type { GoogleBooksVolume, GoogleBooksVolumesListResponse } from "./types.js";

const SOURCE_LINK_NAME = "Google Books";

export interface GoogleBooksProviderOptions extends GoogleBooksClientOptions {
  /** Optional override for the Google Books base URL (self-hosted proxy). See metadataRequestBuilder.ts's doc comment. */
  configuredBaseUrl?: string | null;
  textMatcher?: ITextMatcher;
}

export class GoogleBooksProvider implements MetadataProvider {
  readonly name = "google-books";

  private readonly client: GoogleBooksClient;
  private readonly textMatcher: ITextMatcher;

  constructor(httpClient: IHttpClient, options: GoogleBooksProviderOptions = {}) {
    const requestBuilder = new MetadataRequestBuilder(
      GOOGLE_BOOKS_DEFAULT_BASE_URL,
      options.configuredBaseUrl
    );
    this.client = new GoogleBooksClient(httpClient, requestBuilder, options);
    this.textMatcher = options.textMatcher ?? new NullTextMatcher();
  }

  /**
   * See this file's module doc comment: Google Books has no author lookup
   * endpoint. `foreignAuthorId` here is the synthesized id from
   * `mapper.ts#authorForeignId` (a slug of the author's display name);
   * this method round-trips it by searching `inauthor:"<name>"` is not
   * possible without the original name, so this looks the id up by
   * re-deriving names from a broad search is also not possible. Instead,
   * this throws `AuthorNotFoundException` unconditionally -- honest about
   * the limitation rather than returning a fabricated/empty Author. Author
   * *search* (searchForNewAuthor) works fine since it starts from a name.
   */
  async getAuthorInfo(foreignAuthorId: string): Promise<Author> {
    throw new AuthorNotFoundException(
      foreignAuthorId,
      "Google Books has no author-lookup-by-id endpoint; use searchForNewAuthor(name) instead."
    );
  }

  async getChangedAuthors(): Promise<Set<string> | null> {
    return null;
  }

  async getBookInfo(foreignBookId: string): Promise<BookInfoResult> {
    let volume: GoogleBooksVolume;
    try {
      volume = await this.client.get<GoogleBooksVolume>(`volumes/${foreignBookId}`);
    } catch {
      throw new BookNotFoundException(foreignBookId);
    }

    const workDto = toWorkResourceDto(volume);
    const book = this.mapVolumeBook(workDto);
    const authorMetadata = workDto.authors.map((a) => mapAuthorMetadata(a, SOURCE_LINK_NAME));
    const foreignAuthorId = getPrimaryAuthorId(workDto);

    return { foreignAuthorId, book, authorMetadata };
  }

  async searchForNewAuthor(title: string): Promise<Author[]> {
    const response = await this.client.get<GoogleBooksVolumesListResponse>("volumes", [
      ["q", `inauthor:${title}`],
      ["maxResults", "20"],
    ]);

    const seen = new Set<string>();
    const result: Author[] = [];

    for (const volume of response.items ?? []) {
      for (const name of volume.volumeInfo.authors ?? []) {
        const id = authorForeignId(name);
        if (!seen.has(id)) {
          seen.add(id);
          const dto = toAuthorResourceDto(name);
          result.push(this.toAuthor(mapAuthorMetadata(dto, SOURCE_LINK_NAME)));
        }
      }
    }

    return result;
  }

  /** `getAllEditions` has no effect for this provider -- see this file's module doc comment (one Volume = one edition, always). */
  async searchForNewBook(
    title: string,
    author: string | null,
    _getAllEditions = true
  ): Promise<Book[]> {
    const q =
      author !== null && author.trim() !== "" ? `intitle:${title} inauthor:${author}` : title;

    const response = await this.client.get<GoogleBooksVolumesListResponse>("volumes", [
      ["q", q],
      ["maxResults", "20"],
    ]);

    return (response.items ?? []).map((volume) => this.mapVolumeBook(toWorkResourceDto(volume)));
  }

  async searchByIsbn(isbn: string): Promise<Book[]> {
    const response = await this.client.get<GoogleBooksVolumesListResponse>("volumes", [
      ["q", `isbn:${isbn}`],
      ["maxResults", "1"],
    ]);

    const volume = response.items?.[0];
    return volume ? [this.mapVolumeBook(toWorkResourceDto(volume))] : [];
  }

  /** Google Books does index ASIN-tagged editions inconsistently (no documented `asin:` query operator); falls back to a plain-text search on the identifier, same degrade-gracefully approach as BookInfoProxy.SearchByAsin's shared `Search()` path. */
  async searchByAsin(asin: string): Promise<Book[]> {
    const response = await this.client.get<GoogleBooksVolumesListResponse>("volumes", [
      ["q", asin],
      ["maxResults", "1"],
    ]);

    const volume = response.items?.[0];
    return volume ? [this.mapVolumeBook(toWorkResourceDto(volume))] : [];
  }

  /** A Google Books "edition" IS the foreign id (see this file's module doc comment) -- `getAllEditions` has no effect since there's never more than one. */
  async searchByForeignEditionId(
    foreignEditionId: string,
    _getAllEditions: boolean
  ): Promise<Book[]> {
    try {
      const { book } = await this.getBookInfo(foreignEditionId);
      return [book];
    } catch (e) {
      if (e instanceof BookNotFoundException) {
        return [];
      }
      throw e;
    }
  }

  async searchForNewEntity(title: string): Promise<NewEntitySearchResult[]> {
    const books = await this.searchForNewBook(title, null, false);
    const result: NewEntitySearchResult[] = [];
    const seenAuthors = new Set<string>();

    for (const book of books) {
      const metadata = book.authorMetadata;
      if (metadata !== undefined && !seenAuthors.has(metadata.foreignAuthorId)) {
        seenAuthors.add(metadata.foreignAuthorId);
        result.push({ type: "author", author: this.toAuthor(metadata) });
      }
      result.push({ type: "book", book });
    }

    return result;
  }

  private toAuthor(metadata: AuthorMetadata): Author {
    return { ...newAuthor(), cleanName: this.textMatcher.cleanAuthorName(metadata.name), metadata };
  }

  /**
   * `mapBook` (../mapper.ts) never populates `Book.authorMetadata` on its
   * own -- that's `mapAuthor`'s job when mapping an author's full
   * bibliography (see mapper.ts's module doc comment: "AddDbIds ... is NOT
   * ported here"). Every call site in this provider needs a Book with its
   * primary author's metadata attached (searchForNewAuthor/
   * searchForNewEntity dedupe/build Authors off `book.authorMetadata`), so
   * this wraps `mapBook` with that attachment step -- the same fix applied
   * inline in getBookInfo, factored out since three other methods
   * (searchForNewBook, searchByIsbn, searchByAsin) map a Volume straight
   * to a Book without going through getBookInfo.
   */
  private mapVolumeBook(workDto: ReturnType<typeof toWorkResourceDto>): Book {
    const book = mapBook(workDto, SOURCE_LINK_NAME);
    const authorMetadata = workDto.authors.map((a) => mapAuthorMetadata(a, SOURCE_LINK_NAME));
    const foreignAuthorId = getPrimaryAuthorId(workDto);
    book.authorMetadata =
      authorMetadata.find((m) => m.foreignAuthorId === foreignAuthorId) ?? authorMetadata[0];
    return book;
  }
}
