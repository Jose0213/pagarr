import { describe, expect, it, vi } from "vitest";
import { CachedHttpResponseService } from "../cache/CachedHttpResponseService.js";
import type { ICachedHttpResponseRepository } from "../cache/ICachedHttpResponseRepository.js";
import type { CachedHttpResponse } from "../cache/CachedHttpResponse.js";
import { HttpRequest } from "../HttpRequest.js";
import { HttpResponse } from "../HttpResponse.js";
import { HttpHeader } from "../HttpHeader.js";
import type { IHttpClient } from "../HttpClient.js";

/** Simple in-memory stand-in for the repository -- Datastore isn't ported yet (see ICachedHttpResponseRepository.ts). */
function fakeRepo(initial: CachedHttpResponse[] = []): ICachedHttpResponseRepository & {
  entries: CachedHttpResponse[];
} {
  const entries = [...initial];
  return {
    entries,
    findByUrl(url: string) {
      return entries.find((e) => e.url === url) ?? null;
    },
    upsert(entry: CachedHttpResponse) {
      const idx = entries.findIndex((e) => e.url === entry.url);
      if (idx === -1) {
        entries.push(entry);
      } else {
        entries[idx] = entry;
      }
      return entry;
    },
  };
}

const noopLogger = { trace: () => {}, warn: () => {}, error: () => {} };

describe("CachedHttpResponseService", () => {
  it("cache miss: fetches via httpClient and stores the result when useCache is true", async () => {
    const repo = fakeRepo();
    const httpClient: IHttpClient = {
      execute: vi.fn(),
      downloadFile: vi.fn(),
      get: vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), "fresh content", 200)),
      getTyped: vi.fn(),
      head: vi.fn(),
      post: vi.fn(),
      postTyped: vi.fn(),
    };

    const service = new CachedHttpResponseService(repo, httpClient, noopLogger);
    const request = new HttpRequest("https://api.example.com/books");

    const response = await service.get(request, true, 60_000);

    expect(response.content).toBe("fresh content");
    expect(httpClient.get).toHaveBeenCalledTimes(1);
    expect(repo.entries).toHaveLength(1);
    expect(repo.entries[0]!.value).toBe("fresh content");
    expect(repo.entries[0]!.statusCode).toBe(200);
  });

  it("cache hit: returns the cached value without calling httpClient when useCache is true and not expired", async () => {
    const repo = fakeRepo([
      {
        id: 1,
        url: "https://api.example.com/books",
        lastRefresh: new Date(Date.now() - 1000),
        expiry: new Date(Date.now() + 60_000),
        value: "cached content",
        statusCode: 200,
      },
    ]);

    const httpClient: IHttpClient = {
      execute: vi.fn(),
      downloadFile: vi.fn(),
      get: vi.fn(),
      getTyped: vi.fn(),
      head: vi.fn(),
      post: vi.fn(),
      postTyped: vi.fn(),
    };

    const service = new CachedHttpResponseService(repo, httpClient, noopLogger);
    const request = new HttpRequest("https://api.example.com/books");

    const response = await service.get(request, true, 60_000);

    expect(response.content).toBe("cached content");
    expect(response.statusCode).toBe(200);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("expired cache entry: treated as a miss and refetched", async () => {
    const repo = fakeRepo([
      {
        id: 1,
        url: "https://api.example.com/books",
        lastRefresh: new Date(Date.now() - 120_000),
        expiry: new Date(Date.now() - 60_000), // already expired
        value: "stale content",
        statusCode: 200,
      },
    ]);

    const httpClient: IHttpClient = {
      execute: vi.fn(),
      downloadFile: vi.fn(),
      get: vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), "refreshed content", 200)),
      getTyped: vi.fn(),
      head: vi.fn(),
      post: vi.fn(),
      postTyped: vi.fn(),
    };

    const service = new CachedHttpResponseService(repo, httpClient, noopLogger);
    const response = await service.get(new HttpRequest("https://api.example.com/books"), true, 60_000);

    expect(response.content).toBe("refreshed content");
    expect(httpClient.get).toHaveBeenCalledTimes(1);
    expect(repo.entries[0]!.value).toBe("refreshed content");
  });

  it("useCache=false always bypasses the cache and refetches", async () => {
    const repo = fakeRepo([
      {
        id: 1,
        url: "https://api.example.com/books",
        lastRefresh: new Date(),
        expiry: new Date(Date.now() + 60_000),
        value: "cached content",
        statusCode: 200,
      },
    ]);

    const httpClient: IHttpClient = {
      execute: vi.fn(),
      downloadFile: vi.fn(),
      get: vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), "forced fresh", 200)),
      getTyped: vi.fn(),
      head: vi.fn(),
      post: vi.fn(),
      postTyped: vi.fn(),
    };

    const service = new CachedHttpResponseService(repo, httpClient, noopLogger);
    const response = await service.get(new HttpRequest("https://api.example.com/books"), false, 60_000);

    expect(response.content).toBe("forced fresh");
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });

  it("does not cache an error response", async () => {
    const repo = fakeRepo();
    const httpClient: IHttpClient = {
      execute: vi.fn(),
      downloadFile: vi.fn(),
      get: vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), "error body", 500)),
      getTyped: vi.fn(),
      head: vi.fn(),
      post: vi.fn(),
      postTyped: vi.fn(),
    };

    const service = new CachedHttpResponseService(repo, httpClient, noopLogger);
    const response = await service.get(new HttpRequest("https://api.example.com/books"), true, 60_000);

    expect(response.statusCode).toBe(500);
    expect(repo.entries).toHaveLength(0);
  });

  it("getTyped parses the (possibly cached) response content as JSON", async () => {
    const repo = fakeRepo();
    const httpClient: IHttpClient = {
      execute: vi.fn(),
      downloadFile: vi.fn(),
      get: vi.fn(
        async (request) => new HttpResponse(request, new HttpHeader(), JSON.stringify({ id: 42 }), 200)
      ),
      getTyped: vi.fn(),
      head: vi.fn(),
      post: vi.fn(),
      postTyped: vi.fn(),
    };

    const service = new CachedHttpResponseService(repo, httpClient, noopLogger);
    const response = await service.getTyped<{ id: number }>(
      new HttpRequest("https://api.example.com/books"),
      true,
      60_000
    );

    expect(response.resource).toEqual({ id: 42 });
  });
});
