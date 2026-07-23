import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MediaCoverProxy } from "../mediaCoverProxy.js";
import { sha256Hash } from "../../extras/hashing.js";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import type { IHttpClient } from "../../http/HttpClient.js";

/**
 * No dedicated C# test fixture exists for MediaCoverProxy in
 * NzbDrone.Core.Test/MediaCoverTests (verified -- only
 * CoverExistsSpecificationFixture.cs, ImageResizerFixture.cs,
 * MediaCoverServiceFixture.cs exist there). These tests are new, written
 * directly against MediaCoverProxy.cs's documented behavior:
 * RegisterUrl/GetUrl/GetImage and the 24-hour cache TTL.
 */

function fakeHttpClient(): { client: IHttpClient; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(
    async (request) => new HttpResponse(request, new HttpHeader(), "image-bytes", 200)
  );
  const client = {
    execute: get,
    get,
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  } as unknown as IHttpClient;
  return { client, get };
}

describe("MediaCoverProxy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registerUrl returns null for a null/blank url", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    expect(proxy.registerUrl(null)).toBeNull();
    expect(proxy.registerUrl(undefined)).toBeNull();
    expect(proxy.registerUrl("   ")).toBeNull();
  });

  it("registerUrl builds a MediaCoverProxy path keyed by the url's SHA-256 hash and file name", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    const url = "http://example.com/covers/author.jpg";
    const result = proxy.registerUrl(url);

    expect(result).toBe(`/MediaCoverProxy/${sha256Hash(url)}/author.jpg`);
  });

  it("registerUrl prefixes the result with the configured urlBase", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "/pagarr" });

    const url = "http://example.com/covers/author.jpg";
    const result = proxy.registerUrl(url);

    expect(result).toBe(`/pagarr/MediaCoverProxy/${sha256Hash(url)}/author.jpg`);
  });

  it("getUrl resolves a hash registered via registerUrl back to the original url", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    const url = "http://example.com/covers/author.jpg";
    proxy.registerUrl(url);

    expect(proxy.getUrl(sha256Hash(url))).toBe(url);
  });

  it("getUrl throws when the hash was never registered", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    expect(() => proxy.getUrl("unknown-hash")).toThrow("Url no longer in cache");
  });

  it("getUrl throws once the 24-hour cache entry has expired", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    const url = "http://example.com/covers/author.jpg";
    proxy.registerUrl(url);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    expect(() => proxy.getUrl(sha256Hash(url))).toThrow("Url no longer in cache");
  });

  it("getUrl still resolves just before the 24-hour TTL elapses", () => {
    const { client } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    const url = "http://example.com/covers/author.jpg";
    proxy.registerUrl(url);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);

    expect(proxy.getUrl(sha256Hash(url))).toBe(url);
  });

  it("getImage fetches the resolved url via the http client and returns the response bytes", async () => {
    const { client, get } = fakeHttpClient();
    const proxy = new MediaCoverProxy(client, { urlBase: "" });

    const url = "http://example.com/covers/author.jpg";
    proxy.registerUrl(url);

    const bytes = await proxy.getImage(sha256Hash(url));

    expect(get).toHaveBeenCalledTimes(1);
    const requestArg = get.mock.calls[0]![0] as { url: { toString(): string } };
    expect(requestArg.url.toString()).toBe(url);
    expect(Buffer.from(bytes!).toString()).toBe("image-bytes");
  });
});
