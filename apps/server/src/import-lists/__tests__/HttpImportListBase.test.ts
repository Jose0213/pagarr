import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { TooManyRequestsException } from "../../http/HttpException.js";
import { RequestLimitReachedException } from "../../indexers/exceptions/RequestLimitReachedException.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { IImportListStatusService } from "../ImportListStatusService.js";
import { createImportListDefinition } from "../ImportListDefinition.js";
import { LazyLibrarianImport } from "../lazylibrarian/LazyLibrarianImport.js";
import { createLazyLibrarianImportSettings } from "../lazylibrarian/LazyLibrarianImportSettings.js";

/**
 * Exercises the real `HttpImportListBase` fetch/paging/error-handling
 * pipeline through its one fully-live concrete subclass in this module,
 * `LazyLibrarianImport` -- mirroring the style
 * `indexers/newznab/__tests__/Newznab.test.ts` uses to exercise
 * `HttpIndexerBase` through its own concrete subclass.
 */
function fakeStatusService(): IImportListStatusService & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
  recordConnectionFailure: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastSyncListInfo: vi.fn(() => null),
    updateListSyncStatus: vi.fn(),
  };
}

function httpClientReturning(
  content: string,
  statusCode = 200,
  headers: Record<string, string> = {}
): IHttpClient {
  const get = vi.fn(async (request: HttpRequest) => {
    const h = new HttpHeader();
    for (const [k, v] of Object.entries(headers)) {
      h.set(k, v);
    }
    return new HttpResponse(request, h, content, statusCode);
  });
  return {
    execute: get,
    get,
    head: get,
    post: get,
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

function throwingHttpClient(error: unknown): IHttpClient {
  const thrower = vi.fn(async () => {
    throw error;
  });
  return {
    execute: thrower,
    get: thrower,
    head: thrower,
    post: thrower,
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

function buildSubject(
  httpClient: IHttpClient,
  statusService: ReturnType<typeof fakeStatusService>
) {
  const subject = new LazyLibrarianImport(httpClient, statusService, undefined as never, undefined);
  subject.definition = createImportListDefinition({
    id: 7,
    name: "LazyLibrarian",
    settings: createLazyLibrarianImportSettings({
      baseUrl: "http://ll.local",
      apiKey: "key123",
    }),
  });
  return subject;
}

describe("HttpImportListBase (via LazyLibrarianImport)", () => {
  it("fetches, parses, cleans up (dedup + stamps importListId/importList), and records success", async () => {
    const content = JSON.stringify([
      { BookName: "Mistborn", BookId: "1", AuthorName: "Brandon Sanderson" },
      { BookName: "Mistborn", BookId: "1", AuthorName: "Brandon Sanderson" },
      { BookName: "Elantris", BookId: "2", AuthorName: "Brandon Sanderson" },
    ]);
    const httpClient = httpClientReturning(content);
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    const items = await subject.fetch();

    // Third item is a dedup of the first two (same Author+Book pair).
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.importListId === 7)).toBe(true);
    expect(items.every((i) => i.importList === "LazyLibrarian")).toBe(true);
    expect(statusService.recordSuccess).toHaveBeenCalledWith(7);
    expect(statusService.recordFailure).not.toHaveBeenCalled();
  });

  it("issues the correct getAllBooks request URL", async () => {
    const httpClient = httpClientReturning("[]");
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    await subject.fetch();

    expect(httpClient.execute).toHaveBeenCalledTimes(1);
    const request = (httpClient.execute as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as HttpRequest;
    expect(request.url.fullUri).toBe("http://ll.local/api?cmd=getAllBooks&apikey=key123");
  });

  it("TooManyRequestsException records a failure with the retry-after backoff", async () => {
    const request = new HttpRequest("http://ll.local/api");
    const headers = new HttpHeader();
    headers.set("Retry-After", "120");
    const response = new HttpResponse(request, headers, "", 429);
    const httpClient = throwingHttpClient(new TooManyRequestsException(request, response));
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    const items = await subject.fetch();

    expect(items).toEqual([]);
    expect(statusService.recordFailure).toHaveBeenCalledWith(7, 120000);
  });

  it("RequestLimitReachedException records a failure with a 1-hour backoff", async () => {
    const httpClient = throwingHttpClient(new RequestLimitReachedException("limited"));
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    const items = await subject.fetch();

    expect(items).toEqual([]);
    expect(statusService.recordFailure).toHaveBeenCalledWith(7, 60 * 60 * 1000);
  });

  it("a non-200 status throws ImportListException from the parser and records a plain failure", async () => {
    const httpClient = httpClientReturning("not found", 404);
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    const items = await subject.fetch();

    expect(items).toEqual([]);
    expect(statusService.recordFailure).toHaveBeenCalledWith(7);
  });

  it("test() succeeds when the first page returns at least one result", async () => {
    const content = JSON.stringify([
      { BookName: "Mistborn", BookId: "1", AuthorName: "Brandon Sanderson" },
    ]);
    const httpClient = httpClientReturning(content);
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    const result = await subject.test();

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("test() fails with a friendly message when zero results are returned", async () => {
    const httpClient = httpClientReturning("[]");
    const statusService = fakeStatusService();
    const subject = buildSubject(httpClient, statusService);

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.errorMessage).toContain("No results were returned");
  });
});
