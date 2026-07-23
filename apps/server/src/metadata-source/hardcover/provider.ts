/**
 * Hardcover provider: implements the interfaces ported in ../interfaces.ts
 * against the real Hardcover GraphQL API (https://api.hardcover.app/v1/graphql,
 * schema per https://docs.hardcover.app/api/graphql/schemas/). One of three
 * providers that together replace Readarr's single bookinfo.club/Goodreads
 * dependency -- see ../interfaces.ts's module doc comment and
 * known-issues-fixlist.md #1.
 *
 * Cannot be live-tested in this sandboxed environment (no network access,
 * no real API token) -- structurally correct against the documented
 * schema/query shapes, verified against docs.hardcover.app July 2026.
 */

import { newAuthor, type Author, type AuthorMetadata, type Book } from "../../books/models.js";
import type { ITextMatcher } from "../../books/textMatching.js";
import { NullTextMatcher } from "../../books/textMatching.js";
import type { IHttpClient } from "../../http/index.js";
import type { BookInfoResult, MetadataProvider, NewEntitySearchResult } from "../interfaces.js";
import {
  AuthorNotFoundException,
  BookNotFoundException,
  MetadataProviderException,
} from "../errors.js";
import { mapAuthor, mapAuthorMetadata, mapBook, getPrimaryAuthorId } from "../mapper.js";
import { MetadataRequestBuilder } from "../metadataRequestBuilder.js";
import {
  HARDCOVER_DEFAULT_BASE_URL,
  HardcoverClient,
  type HardcoverClientOptions,
} from "./client.js";
import { toAuthorResourceDto, toWorkResourceDto } from "./mapper.js";
import type {
  HardcoverAuthorsQueryResponse,
  HardcoverBook,
  HardcoverBooksQueryResponse,
  HardcoverEditionsQueryResponse,
  HardcoverSearchQueryResponse,
} from "./types.js";

const SOURCE_LINK_NAME = "Hardcover";

const BOOK_FIELDS = `
  id
  title
  subtitle
  slug
  description
  release_date
  release_year
  pages
  rating
  ratings_count
  image { url width height }
  contributions {
    contribution
    author { id name bio slug image { url } books_count born_date born_year death_date links }
  }
  editions {
    id
    title
    subtitle
    isbn_10
    isbn_13
    asin
    pages
    release_date
    edition_format
    edition_information
    physical_format
    language { language }
    reading_format { format }
    publisher { name }
    image { url }
    rating
    users_count
  }
  book_series {
    position
    details
    series { id name slug description books_count primary_books_count }
  }
`;

export interface HardcoverProviderOptions extends HardcoverClientOptions {
  /** Optional override for the Hardcover API base URL (self-hosted proxy/mirror). See metadataRequestBuilder.ts's doc comment. */
  configuredBaseUrl?: string | null;
  textMatcher?: ITextMatcher;
}

export class HardcoverProvider implements MetadataProvider {
  readonly name = "hardcover";

  private readonly client: HardcoverClient;
  private readonly textMatcher: ITextMatcher;

  constructor(httpClient: IHttpClient, options: HardcoverProviderOptions) {
    const requestBuilder = new MetadataRequestBuilder(
      HARDCOVER_DEFAULT_BASE_URL,
      options.configuredBaseUrl
    );
    this.client = new HardcoverClient(httpClient, requestBuilder, options);
    this.textMatcher = options.textMatcher ?? new NullTextMatcher();
  }

  async getAuthorInfo(foreignAuthorId: string): Promise<Author> {
    const id = Number.parseInt(foreignAuthorId, 10);
    if (Number.isNaN(id)) {
      throw new AuthorNotFoundException(foreignAuthorId);
    }

    const data = await this.client.query<HardcoverAuthorsQueryResponse["data"]>(
      `query GetAuthor($id: Int!) {
        authors(where: {id: {_eq: $id}}, limit: 1) {
          id name bio slug image { url } books_count born_date born_year death_date links
          contributions(where: {contributable_type: {_eq: "Book"}}) {
            book { ${BOOK_FIELDS} }
          }
        }
      }`,
      { id }
    );

    const author = data?.authors[0];
    if (author === undefined) {
      throw new AuthorNotFoundException(foreignAuthorId);
    }

    const works = author.contributions
      .map((c) => c.book)
      .filter((b): b is HardcoverBook => b !== null);

    const authorDto = toAuthorResourceDto(author, works.map(toWorkResourceDto));

    return mapAuthor(authorDto, this.textMatcher, SOURCE_LINK_NAME);
  }

  async getChangedAuthors(): Promise<Set<string> | null> {
    // Hardcover's public API doesn't currently expose a "changed since"
    // feed (no equivalent of BookInfo's `author/changed` route) -- see
    // ../interfaces.ts's IProvideAuthorInfo doc comment for how the C#
    // original used `null` to mean "provider can't tell us." Same meaning
    // here: a future full refresh should not treat this as "nothing
    // changed."
    return null;
  }

  async getBookInfo(foreignBookId: string): Promise<BookInfoResult> {
    const id = Number.parseInt(foreignBookId, 10);
    if (Number.isNaN(id)) {
      throw new BookNotFoundException(foreignBookId);
    }

    const data = await this.client.query<HardcoverBooksQueryResponse["data"]>(
      `query GetBook($id: Int!) {
        books(where: {id: {_eq: $id}}, limit: 1) { ${BOOK_FIELDS} }
      }`,
      { id }
    );

    const hcBook = data?.books[0];
    if (hcBook === undefined) {
      throw new BookNotFoundException(foreignBookId);
    }

    const workDto = toWorkResourceDto(hcBook);
    const book = this.mapWorkBook(workDto);
    const authorMetadata = workDto.authors.map((a) => mapAuthorMetadata(a, SOURCE_LINK_NAME));
    const foreignAuthorId = getPrimaryAuthorId(workDto);

    return { foreignAuthorId, book, authorMetadata };
  }

  async searchForNewAuthor(title: string): Promise<Author[]> {
    const books = await this.searchForNewBook(title, null, false);
    const seen = new Set<string>();
    const result: Author[] = [];

    for (const book of books) {
      const metadata = book.authorMetadata;
      if (metadata !== undefined && !seen.has(metadata.foreignAuthorId)) {
        seen.add(metadata.foreignAuthorId);
        result.push(this.toAuthor(metadata));
      }
    }

    return result;
  }

  /** Ported from BookInfoProxy's pattern of constructing a bare Author around fetched AuthorMetadata (see BookInfoProxy.AddDbIds's `new Author { CleanName = ..., Metadata = metadata }` when no DB row exists yet). */
  private toAuthor(metadata: AuthorMetadata): Author {
    return { ...newAuthor(), cleanName: this.textMatcher.cleanAuthorName(metadata.name), metadata };
  }

  /**
   * Ported from BookInfoProxy.SearchForNewBook's overall shape (build a
   * query string from title+author, search, then resolve each hit to a
   * full Book). Deviation: BookInfoProxy's `getAllEditions` flag changes
   * *how* it fetches (author-id sweep vs. single-book bulk-fetch) to
   * balance API load; Hardcover's `getBookInfo` always returns every
   * edition Hardcover knows about for a book in one query (see BOOK_FIELDS),
   * so there's no cheaper "single edition" query to fall back to here --
   * `getAllEditions=false` still returns full-edition Books. A future
   * optimization could trim `book.editions` down to one when the caller
   * doesn't need them all; not done here to avoid guessing which edition
   * the caller wants without evidence from the C# original's own
   * single-edition trimming logic (BookInfoProxy.GetEditionInfo, which is
   * ISBN/edition-id-search-specific, not applicable to a title search).
   */
  async searchForNewBook(
    title: string,
    author: string | null,
    _getAllEditions = true
  ): Promise<Book[]> {
    const query = author !== null && author.trim() !== "" ? `${title} ${author}` : title;

    let hits: Array<Record<string, unknown>>;
    try {
      hits = await this.searchTypesense(query, "Book");
    } catch (e) {
      throw new MetadataProviderException("hardcover", `Search for '${title}' failed.`, {
        cause: e,
      });
    }

    const ids = hits
      .map((h) => h["id"])
      .filter((id): id is number | string => typeof id === "number" || typeof id === "string")
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id));

    if (ids.length === 0) {
      return [];
    }

    const books: Book[] = [];
    for (const id of ids) {
      try {
        const { book } = await this.getBookInfo(String(id));
        books.push(book);
      } catch (e) {
        if (e instanceof BookNotFoundException) {
          continue;
        }
        throw e;
      }
    }

    return books;
  }

  async searchByIsbn(isbn: string): Promise<Book[]> {
    const data = await this.client.query<HardcoverEditionsQueryResponse["data"]>(
      `query GetEditionByIsbn($isbn13: String!) {
        editions(where: {isbn_13: {_eq: $isbn13}}, limit: 1) {
          id
          book { ${BOOK_FIELDS} }
        }
      }`,
      { isbn13: isbn }
    );

    const edition = data?.editions[0];
    if (edition === undefined) {
      return [];
    }

    const workDto = toWorkResourceDto(edition.book);
    return [this.mapWorkBook(workDto)];
  }

  async searchByAsin(asin: string): Promise<Book[]> {
    const data = await this.client.query<HardcoverEditionsQueryResponse["data"]>(
      `query GetEditionByAsin($asin: String!) {
        editions(where: {asin: {_eq: $asin}}, limit: 1) {
          id
          book { ${BOOK_FIELDS} }
        }
      }`,
      { asin }
    );

    const edition = data?.editions[0];
    if (edition === undefined) {
      return [];
    }

    const workDto = toWorkResourceDto(edition.book);
    return [this.mapWorkBook(workDto)];
  }

  async searchByForeignEditionId(foreignEditionId: string): Promise<Book[]> {
    const id = Number.parseInt(foreignEditionId, 10);
    if (Number.isNaN(id)) {
      return [];
    }

    const data = await this.client.query<HardcoverEditionsQueryResponse["data"]>(
      `query GetEdition($id: Int!) {
        editions(where: {id: {_eq: $id}}, limit: 1) {
          id
          book { ${BOOK_FIELDS} }
        }
      }`,
      { id }
    );

    const edition = data?.editions[0];
    if (edition === undefined) {
      return [];
    }

    const workDto = toWorkResourceDto(edition.book);
    return [this.mapWorkBook(workDto)];
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

  /**
   * Ported shape from GoodreadsSearchProxy.Search: hits Hardcover's
   * Typesense-backed `search` query (see
   * https://docs.hardcover.app/api/guides/searching/) and returns the raw
   * hit documents.
   */
  private async searchTypesense(
    query: string,
    queryType: string
  ): Promise<Array<Record<string, unknown>>> {
    const data = await this.client.query<HardcoverSearchQueryResponse["data"]>(
      `query Search($query: String!, $queryType: String!) {
        search(query: $query, query_type: $queryType, per_page: 25, page: 1) {
          results
        }
      }`,
      { query, queryType }
    );

    const hits = data?.search.results?.hits ?? [];
    return hits.map((h) => h.document);
  }

  /** See google-books/provider.ts's `mapVolumeBook` for the identical rationale: `mapBook` alone never populates `Book.authorMetadata`, so every call site that maps a WorkResourceDto straight to a Book (bypassing getBookInfo) needs this wrapper too. */
  private mapWorkBook(workDto: ReturnType<typeof toWorkResourceDto>): Book {
    const book = mapBook(workDto, SOURCE_LINK_NAME);
    const authorMetadata = workDto.authors.map((a) => mapAuthorMetadata(a, SOURCE_LINK_NAME));
    const foreignAuthorId = getPrimaryAuthorId(workDto);
    book.authorMetadata =
      authorMetadata.find((m) => m.foreignAuthorId === foreignAuthorId) ?? authorMetadata[0];
    return book;
  }
}
