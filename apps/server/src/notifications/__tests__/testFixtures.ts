import { vi } from "vitest";
import type { Author, AuthorMetadata, Book, Edition } from "../../books/models.js";
import {
  newAddBookOptions,
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
} from "../../books/models.js";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { BookFile } from "../../media-files-import/bookFile.js";
import { newBookFile } from "../../media-files-import/bookFile.js";
import { Quality } from "../../qualities/quality.js";
import { newQualityModel } from "../../qualities/qualityModel.js";

/**
 * Shared no-op logger fixture, structurally compatible with every
 * per-notifier-proxy logger interface in this module (e.g.
 * `discord/DiscordProxy.ts`'s `DiscordProxyLogger`) -- each of those is a
 * narrow subset of this shape, matching this port's per-module logger
 * convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`).
 */
export function noopLogger() {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

export function testAuthor(
  overrides: Partial<Author> = {},
  metadataName = "Brandon Sanderson"
): Author {
  return {
    ...newAuthor(),
    metadata: { ...newAuthorMetadata(), name: metadataName },
    ...overrides,
  };
}

export function testBook(author: Author, overrides: Partial<Book> = {}): Book {
  return {
    ...newBook(),
    title: "The Way of Kings",
    author,
    ...overrides,
  };
}

export function testEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    ...newEdition(),
    id: 1,
    bookId: 1,
    title: "Test Edition",
    foreignEditionId: "edition-1",
    monitored: true,
    ...overrides,
  };
}

export function testBookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    ...newBookFile(),
    id: 1,
    path: "C:\\Authors\\Test Author\\Test Book\\file.mp3",
    quality: newQualityModel(Quality.MP3),
    size: 1000,
    dateAdded: "2026-01-01T00:00:00.000Z",
    editionId: 1,
    edition: testEdition(),
    author: testAuthor(),
    ...overrides,
  };
}

/** Builds a fake IHttpClient whose execute/get/post/head all resolve with a canned 200 response, recording every call. */
export function fakeHttpClient(
  statusCode = 200,
  content = "{}"
): IHttpClient & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];

  const handler = vi.fn(async (request: HttpRequest) => {
    calls.push(request);
    return new HttpResponse(request, new HttpHeader(), content, statusCode);
  });

  return {
    calls,
    execute: handler,
    get: handler,
    post: handler,
    head: handler,
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

/**
 * Object-overrides-style fake `IHttpClient`, distinct from `fakeHttpClient`
 * above (that one is this file's original positional `(statusCode, content)`
 * canned-200-response builder, already depended on by the chat/media
 * notifier tests). This one matches `download-clients/__tests__/testFixtures.ts`'s
 * `fakeHttpClient(overrides)` convention -- the push notifier group's tests
 * (apprise/gotify/join/notifiarr/ntfy/prowl/pushbullet/pushover) were built
 * against that shape and override individual methods (`execute`/`post`) per
 * test case. Named distinctly here rather than reconciling the two
 * conventions into one signature, since both are independently established
 * elsewhere in this port and dozens of call sites already depend on each.
 */
export function fakeHttpClientWithOverrides(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    head: vi.fn(),
    post: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

/** Builds a real HttpResponse for a given request/body/status -- a shorthand around `new HttpResponse(...)` for proxy tests that need to assert on `httpClient.execute`'s resolved value or set up specific status codes. */
export function fakeJsonResponse(body: unknown, statusCode = 200): HttpResponse {
  return new HttpResponse(
    // request is attached by the caller via httpClient mock closures; a
    // throwaway HttpRequest-shaped stub is fine here since none of these
    // tests read `.request` off the response.
    { url: { toString: () => "" } } as never,
    new HttpHeader({ "Content-Type": "application/json" }),
    JSON.stringify(body),
    statusCode
  );
}

export function fakeAuthorMetadata(overrides: Partial<AuthorMetadata> = {}): AuthorMetadata {
  return {
    id: 1,
    foreignAuthorId: "goodreads-author-1",
    titleSlug: "test-author",
    name: "Test Author",
    sortName: "author, test",
    nameLastFirst: "Author, Test",
    sortNameLastFirst: "author, test",
    aliases: [],
    overview: null,
    disambiguation: "",
    gender: null,
    hometown: "",
    born: null,
    died: null,
    status: 0,
    images: [],
    links: [],
    genres: [],
    ratings: { votes: 0, value: 0 },
    ...overrides,
  };
}

export function fakeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 1,
    cleanName: "testauthor",
    monitored: true,
    monitorNewItems: 0,
    lastInfoSync: null,
    path: "C:\\books\\Test Author",
    rootFolderPath: "C:\\books",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    metadata: fakeAuthorMetadata(),
    ...overrides,
  };
}

export function fakeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    authorMetadataId: 1,
    foreignBookId: "goodreads-book-1",
    titleSlug: "test-book",
    title: "Test Book",
    releaseDate: null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "testbook",
    monitored: true,
    anyEditionOk: true,
    lastInfoSync: null,
    added: null,
    addOptions: newAddBookOptions(),
    ...overrides,
  };
}
