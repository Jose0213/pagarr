/**
 * OpenLibrary provider: implements the interfaces ported in
 * ../interfaces.ts against the real OpenLibrary REST API
 * (https://openlibrary.org/dev/docs/api/{search,books}). One of three
 * providers that together replace Readarr's single bookinfo.club/Goodreads
 * dependency -- see ../interfaces.ts's module doc comment and
 * known-issues-fixlist.md #1.
 *
 * Cannot be live-tested in this sandboxed environment (no network access)
 * -- structurally correct against the documented endpoint/response shapes,
 * verified against openlibrary.org's own live JSON responses July 2026.
 */

import { newAuthor, type Author, type AuthorMetadata, type Book } from "../../books/models.js";
import type { ITextMatcher } from "../../books/textMatching.js";
import { NullTextMatcher } from "../../books/textMatching.js";
import type { IHttpClient } from "../../http/index.js";
import type { BookInfoResult, MetadataProvider, NewEntitySearchResult } from "../interfaces.js";
import { AuthorNotFoundException, BookNotFoundException } from "../errors.js";
import { mapAuthor, mapAuthorMetadata, mapBook, getPrimaryAuthorId } from "../mapper.js";
import { MetadataRequestBuilder } from "../metadataRequestBuilder.js";
import {
  OPEN_LIBRARY_DEFAULT_BASE_URL,
  OpenLibraryClient,
  type OpenLibraryClientOptions,
} from "./client.js";
import {
  idFromKey,
  toAuthorResourceDto,
  toAuthorResourceDtoFromSearch,
  toWorkResourceDto,
} from "./mapper.js";
import type {
  OpenLibraryAuthor,
  OpenLibraryAuthorSearchResponse,
  OpenLibraryEditionsResponse,
  OpenLibrarySearchResponse,
  OpenLibraryWork,
} from "./types.js";

const SOURCE_LINK_NAME = "OpenLibrary";

export interface OpenLibraryProviderOptions extends OpenLibraryClientOptions {
  /** Optional override for the OpenLibrary base URL (self-hosted mirror). See metadataRequestBuilder.ts's doc comment. */
  configuredBaseUrl?: string | null;
  textMatcher?: ITextMatcher;
}

export class OpenLibraryProvider implements MetadataProvider {
  readonly name = "open-library";

  private readonly client: OpenLibraryClient;
  private readonly textMatcher: ITextMatcher;

  constructor(httpClient: IHttpClient, options: OpenLibraryProviderOptions = {}) {
    const requestBuilder = new MetadataRequestBuilder(
      OPEN_LIBRARY_DEFAULT_BASE_URL,
      options.configuredBaseUrl
    );
    this.client = new OpenLibraryClient(httpClient, requestBuilder, options);
    this.textMatcher = options.textMatcher ?? new NullTextMatcher();
  }

  async getAuthorInfo(foreignAuthorId: string): Promise<Author> {
    let author: OpenLibraryAuthor;
    try {
      author = await this.client.get<OpenLibraryAuthor>(`authors/${foreignAuthorId}.json`);
    } catch {
      throw new AuthorNotFoundException(foreignAuthorId);
    }

    // OpenLibrary has no "list all works by this author, with editions
    // inline" endpoint the way Hardcover/BookInfo do -- works and authors
    // are fetched independently (/authors/{id}/works.json lists works but
    // without edition detail). Populate the author's own metadata here;
    // callers that need the author's bibliography should call
    // searchForNewAuthor or fetch works separately. This mirrors
    // OpenLibrary's actual API shape rather than forcing a shape it
    // doesn't have.
    const authorDto = toAuthorResourceDto(author);
    return mapAuthor(authorDto, this.textMatcher, SOURCE_LINK_NAME);
  }

  async getChangedAuthors(): Promise<Set<string> | null> {
    // OpenLibrary's public API has no "changed since" feed for authors --
    // see hardcover/provider.ts's identical rationale and
    // ../interfaces.ts's IProvideAuthorInfo doc comment for why `null`
    // (not an empty set) is the correct "can't tell you" signal.
    return null;
  }

  async getBookInfo(foreignBookId: string): Promise<BookInfoResult> {
    let work: OpenLibraryWork;
    try {
      work = await this.client.get<OpenLibraryWork>(`works/${foreignBookId}.json`);
    } catch {
      throw new BookNotFoundException(foreignBookId);
    }

    const editionsResponse = await this.client
      .get<OpenLibraryEditionsResponse>(`works/${foreignBookId}/editions.json`)
      .catch(() => ({ entries: [] }));

    const authorKeys = (work.authors ?? []).map((a) => a.author.key);
    const authors = await this.fetchAuthors(authorKeys);

    const workDto = toWorkResourceDto(work, editionsResponse.entries, authors);
    const book = mapBook(workDto, SOURCE_LINK_NAME);
    const authorMetadata = workDto.authors.map((a) => mapAuthorMetadata(a, SOURCE_LINK_NAME));
    const foreignAuthorId = getPrimaryAuthorId(workDto) || idFromKey(authorKeys[0] ?? "");

    // See hardcover/provider.ts's identical fix -- ported from
    // BookInfoProxy.AddDbIds's `book.AuthorMetadata = author.Metadata.Value`.
    book.authorMetadata =
      authorMetadata.find((m) => m.foreignAuthorId === foreignAuthorId) ?? authorMetadata[0];

    return { foreignAuthorId, book, authorMetadata };
  }

  async searchForNewAuthor(title: string): Promise<Author[]> {
    const response = await this.client.get<OpenLibraryAuthorSearchResponse>("search/authors.json", [
      ["q", title],
    ]);

    return response.docs.map((doc) => {
      const dto = toAuthorResourceDtoFromSearch(doc);
      return this.toAuthor(mapAuthorMetadata(dto, SOURCE_LINK_NAME));
    });
  }

  async searchForNewBook(
    title: string,
    author: string | null,
    getAllEditions = true
  ): Promise<Book[]> {
    const query = author !== null && author.trim() !== "" ? `${title} ${author}` : title;
    const response = await this.client.get<OpenLibrarySearchResponse>("search.json", [
      ["q", query],
      ["limit", "20"],
    ]);

    const books: Book[] = [];

    for (const doc of response.docs) {
      const workId = idFromKey(doc.key);

      if (getAllEditions) {
        try {
          const { book } = await this.getBookInfo(workId);
          books.push(book);
        } catch (e) {
          if (e instanceof BookNotFoundException) {
            continue;
          }
          throw e;
        }
      } else {
        // Lighter path: build a Book straight from the search summary doc
        // without a per-work follow-up fetch, matching BookInfoProxy's
        // "getAllEditions=false is cheaper on the metadata API" intent.
        books.push(this.bookFromSearchDoc(doc));
      }
    }

    return books;
  }

  async searchByIsbn(isbn: string): Promise<Book[]> {
    const response = await this.client.get<OpenLibrarySearchResponse>("search.json", [
      ["q", `isbn:${isbn}`],
      ["limit", "1"],
    ]);

    const doc = response.docs[0];
    if (doc === undefined) {
      return [];
    }

    try {
      const { book } = await this.getBookInfo(idFromKey(doc.key));
      return [book];
    } catch {
      return [this.bookFromSearchDoc(doc)];
    }
  }

  async searchByAsin(): Promise<Book[]> {
    // OpenLibrary doesn't index ASIN as a searchable identifier (it's an
    // Amazon-specific id; OpenLibrary's `id_amazon` field exists on some
    // edition records but isn't exposed via the search API's `q=` free
    // text in a documented way). Returning an empty result (matching
    // BookInfoProxy.SearchByAsin's degrade-to-empty-list behavior when a
    // provider can't resolve a query) rather than guessing at an
    // undocumented query syntax.
    return [];
  }

  async searchByForeignEditionId(
    foreignEditionId: string,
    getAllEditions: boolean
  ): Promise<Book[]> {
    let edition: { works?: Array<{ key: string }> };
    try {
      edition = await this.client.get(`books/${foreignEditionId}.json`);
    } catch {
      return [];
    }

    const workKey = edition.works?.[0]?.key;
    if (workKey === undefined) {
      return [];
    }

    try {
      const { book } = await this.getBookInfo(idFromKey(workKey));

      if (!getAllEditions) {
        const singleEdition = book.editions?.find((e) => e.foreignEditionId === foreignEditionId);
        return [{ ...book, editions: singleEdition ? [singleEdition] : book.editions }];
      }

      return [book];
    } catch {
      return [];
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

  private async fetchAuthors(authorKeys: string[]): Promise<OpenLibraryAuthor[]> {
    const authors: OpenLibraryAuthor[] = [];

    for (const key of authorKeys) {
      try {
        authors.push(await this.client.get<OpenLibraryAuthor>(`${trimLeadingSlash(key)}.json`));
      } catch {
        // Skip authors OpenLibrary can't resolve rather than failing the
        // whole book lookup -- matches this module's overall fail-soft
        // philosophy for search-adjacent lookups (see interfaces.ts).
      }
    }

    return authors;
  }

  /** Builds a Book directly from a search.json `docs[]` entry, no per-work fetch. Used by the getAllEditions=false fast path. */
  private bookFromSearchDoc(doc: OpenLibrarySearchResponse["docs"][number]): Book {
    const workDto = toWorkResourceDto(
      {
        key: doc.key,
        title: doc.title,
        first_publish_date:
          doc.first_publish_year !== undefined ? String(doc.first_publish_year) : undefined,
        subjects: doc.subject,
      },
      [],
      []
    );

    const book = mapBook(workDto, SOURCE_LINK_NAME);

    if (doc.author_name && doc.author_name.length > 0) {
      const authorKey = doc.author_key?.[0];
      const dto = toAuthorResourceDtoFromSearch({
        key: authorKey ?? doc.author_name[0]!,
        name: doc.author_name[0]!,
      });
      book.authorMetadata = mapAuthorMetadata(dto, SOURCE_LINK_NAME);
    }

    return book;
  }
}

function trimLeadingSlash(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}
