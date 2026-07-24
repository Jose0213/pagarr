import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { ReadarrV1Proxy } from "../ReadarrV1Proxy.js";
import { createReadarrSettings } from "../ReadarrSetting.js";
import type { ReadarrAuthor } from "../ReadarrAPIResource.js";

function httpClientReturning(content: string, statusCode = 200): IHttpClient {
  const get = vi.fn(
    async (request: HttpRequest) => new HttpResponse(request, new HttpHeader(), content, statusCode)
  );
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

describe("ReadarrV1Proxy", () => {
  it("hits /api/v1/author with the X-Api-Key header and the trimmed base URL", async () => {
    const httpClient = httpClientReturning("[]");
    const proxy = new ReadarrV1Proxy(httpClient);
    const settings = createReadarrSettings({ baseUrl: "http://remote:8787/", apiKey: "secret" });

    await proxy.getAuthors(settings);

    const request = (httpClient.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as HttpRequest;
    expect(request.url.fullUri).toBe("http://remote:8787/api/v1/author");
    expect(request.headers.get("X-Api-Key")).toBe("secret");
  });

  it("returns an empty array without making a request when BaseUrl or ApiKey is blank", async () => {
    const httpClient = httpClientReturning("[]");
    const proxy = new ReadarrV1Proxy(httpClient);

    expect(await proxy.getAuthors(createReadarrSettings({ baseUrl: "", apiKey: "key" }))).toEqual(
      []
    );
    expect(
      await proxy.getAuthors(createReadarrSettings({ baseUrl: "http://x", apiKey: "" }))
    ).toEqual([]);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("deserializes the JSON author list", async () => {
    const authors: Partial<ReadarrAuthor>[] = [
      { id: 1, authorName: "Brandon Sanderson", foreignAuthorId: "a1" },
    ];
    const httpClient = httpClientReturning(JSON.stringify(authors));
    const proxy = new ReadarrV1Proxy(httpClient);

    const result = await proxy.getAuthors(
      createReadarrSettings({ baseUrl: "http://x", apiKey: "key" })
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.authorName).toBe("Brandon Sanderson");
  });

  it("throws HttpException for a >=300 status code", async () => {
    const httpClient = httpClientReturning("Not Found", 404);
    const proxy = new ReadarrV1Proxy(httpClient);

    await expect(
      proxy.getAuthors(createReadarrSettings({ baseUrl: "http://x", apiKey: "key" }))
    ).rejects.toThrow();
  });

  describe("test()", () => {
    it("returns null (success) when getAuthors resolves", async () => {
      const httpClient = httpClientReturning("[]");
      const proxy = new ReadarrV1Proxy(httpClient);

      const result = await proxy.test(
        createReadarrSettings({ baseUrl: "http://x", apiKey: "key" })
      );

      expect(result).toBeNull();
    });

    it("reports an invalid API key on a 401", async () => {
      const httpClient = httpClientReturning("Unauthorized", 401);
      const proxy = new ReadarrV1Proxy(httpClient);

      const result = await proxy.test(
        createReadarrSettings({ baseUrl: "http://x", apiKey: "wrong" })
      );

      expect(result?.propertyName).toBe("apiKey");
      expect(result?.errorMessage).toBe("API Key is invalid");
    });

    it("reports a missing URL base on a redirect", async () => {
      const httpClient = httpClientReturning("", 302);
      const proxy = new ReadarrV1Proxy(httpClient);

      const result = await proxy.test(
        createReadarrSettings({ baseUrl: "http://x", apiKey: "key" })
      );

      expect(result?.propertyName).toBe("baseUrl");
      expect(result?.errorMessage).toContain("URL base");
    });

    it("reports a generic connection error for other HTTP failures", async () => {
      const httpClient = httpClientReturning("", 500);
      const proxy = new ReadarrV1Proxy(httpClient);

      const result = await proxy.test(
        createReadarrSettings({ baseUrl: "http://x", apiKey: "key" })
      );

      expect(result?.propertyName).toBe("");
      expect(result?.errorMessage).toContain("Unable to connect to import list");
    });
  });
});
