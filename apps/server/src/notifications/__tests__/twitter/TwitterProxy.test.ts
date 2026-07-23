import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import type { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { TwitterProxy, encodeRFC3986 } from "../../twitter/TwitterProxy.js";
import { createTwitterSettings } from "../../twitter/TwitterSettings.js";

function fakeHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    ),
    get: vi.fn(
      async (req: HttpRequest) =>
        new HttpResponse(req, new HttpHeader(), "oauth_token=abc&oauth_token_secret=def", 200)
    ),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

describe("encodeRFC3986", () => {
  it("returns empty string for empty input", () => {
    expect(encodeRFC3986("")).toBe("");
  });

  it("percent-encodes reserved characters the OAuth spec cares about", () => {
    expect(encodeRFC3986("(hello)")).toBe("%28hello%29");
    expect(encodeRFC3986("$5")).toBe("%245");
    expect(encodeRFC3986("a!b")).toBe("a%21b");
    expect(encodeRFC3986("a*b")).toBe("a%2Ab");
    expect(encodeRFC3986("it's")).toBe("it%27s");
  });

  it("un-escapes %7E back to a literal tilde", () => {
    expect(encodeRFC3986("~user")).toBe("~user");
  });

  it("upper-cases hex escape sequences", () => {
    // encodeURIComponent already upper-cases by default in V8, but this
    // asserts the behavior explicitly per the ported .ToUpper() regex step.
    expect(encodeRFC3986("café")).toMatch(/%[0-9A-F]{2}/);
  });
});

describe("TwitterProxy", () => {
  it("updateStatus posts to the v1.1 statuses/update.json endpoint with an Authorization header", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const proxy = new TwitterProxy(fakeHttpClient({ execute }));

    const settings = createTwitterSettings({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
    });

    await proxy.updateStatus("Hello world", settings);

    expect(execute).toHaveBeenCalledTimes(1);
    const request = execute.mock.calls[0]![0];

    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("https://api.twitter.com/1.1/statuses/update.json");
    expect(request.headers.get("Authorization")).toMatch(/^OAuth /);
    expect(request.headers.contentType).toBe("application/x-www-form-urlencoded");

    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toBe("status=Hello%20world");
  });

  it("directMessage posts to the v1.1 direct_messages/new.json endpoint with text+screenname", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const proxy = new TwitterProxy(fakeHttpClient({ execute }));

    const settings = createTwitterSettings({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
      mention: "someuser",
    });

    await proxy.directMessage("Hi there", settings);

    const request = execute.mock.calls[0]![0];
    expect(request.url.toString()).toBe("https://api.twitter.com/1.1/direct_messages/new.json");

    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toBe("text=Hi%20there&screenname=someuser");
  });

  it("getOAuthRedirect builds the authorize URL from the request-token response", async () => {
    // TwitterProxy routes OAuth requests through executeRequest() ->
    // httpClient.execute(), not httpClient.get() -- matching the real C#'s
    // `ExecuteRequest` wrapping `_httpClient.Execute(request)` even for
    // GET-shaped OAuth calls (TwitterProxy.cs's GetRequest always builds a
    // generic HttpRequest, never calls a verb-specific client method).
    const execute = vi.fn(
      async (req: HttpRequest) =>
        new HttpResponse(req, new HttpHeader(), "oauth_token=req-token-123", 200)
    );
    const proxy = new TwitterProxy(fakeHttpClient({ execute }));

    const url = await proxy.getOAuthRedirect("ck", "cs", "https://example.com/callback");

    expect(url).toBe("https://api.twitter.com/oauth/authorize?oauth_token=req-token-123");
  });

  it("getOAuthToken parses the access-token response into a URLSearchParams", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) =>
        new HttpResponse(req, new HttpHeader(), "oauth_token=abc&oauth_token_secret=def", 200)
    );
    const proxy = new TwitterProxy(fakeHttpClient({ execute }));

    const result = await proxy.getOAuthToken("ck", "cs", "req-token", "verifier");

    expect(result.get("oauth_token")).toBe("abc");
    expect(result.get("oauth_token_secret")).toBe("def");
  });
});
