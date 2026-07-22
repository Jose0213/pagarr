import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../HttpClient.js";
import { HttpRequest } from "../HttpRequest.js";
import { HttpResponse } from "../HttpResponse.js";
import { HttpHeader } from "../HttpHeader.js";
import { HttpException, TooManyRequestsException } from "../HttpException.js";
import { RateLimitService } from "../RateLimitService.js";
import type { IHttpDispatcher } from "../dispatchers/IHttpDispatcher.js";
import type { CookieJar } from "../CookieJar.js";

function fakeDispatcher(responses: HttpResponse[]): IHttpDispatcher {
  let call = 0;
  return {
    getResponse: vi.fn(async (request, _cookies: CookieJar) => {
      const response = responses[call];
      call++;
      if (!response) {
        throw new Error("fakeDispatcher: ran out of canned responses");
      }
      // Ensure the returned response's `request` field reflects the request
      // actually passed in for this call (mirrors real dispatcher behavior).
      return new HttpResponse(request, response.headers, response.responseData, response.statusCode, response.version);
    }),
  };
}

function noRateLimit() {
  return new RateLimitService(async () => {});
}

describe("HttpClient", () => {
  it("returns a successful response as-is", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), '{"ok":true}', 200),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    const request = new HttpRequest("https://api.example.com/books");
    const response = await client.get(request);

    expect(response.statusCode).toBe(200);
    expect(response.content).toBe('{"ok":true}');
  });

  it("throws HttpException on a 4xx/5xx response by default", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), "nope", 404),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    await expect(client.get(new HttpRequest("https://api.example.com/books"))).rejects.toThrow(
      HttpException
    );
  });

  it("suppresses the error when suppressHttpError is set", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), "nope", 404),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    const request = new HttpRequest("https://api.example.com/books");
    request.suppressHttpError = true;

    const response = await client.get(request);
    expect(response.statusCode).toBe(404);
  });

  it("suppresses only the listed status codes via suppressHttpErrorStatusCodes", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), "nope", 404),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    const request = new HttpRequest("https://api.example.com/books");
    request.suppressHttpErrorStatusCodes = [404];

    const response = await client.get(request);
    expect(response.statusCode).toBe(404);
  });

  it("throws TooManyRequestsException on 429", async () => {
    const headers = new HttpHeader();
    headers.set("Retry-After", "30");
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), headers, "slow down", 429),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    await expect(client.get(new HttpRequest("https://api.example.com/books"))).rejects.toThrow(
      TooManyRequestsException
    );
  });

  it("follows a redirect chain and returns the final response", async () => {
    const redirectHeaders = new HttpHeader();
    redirectHeaders.set("Location", "https://api.example.com/books/final");

    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), redirectHeaders, "", 302),
      new HttpResponse(new HttpRequest("https://api.example.com/books/final"), new HttpHeader(), "done", 200),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    const request = new HttpRequest("https://api.example.com/books");
    request.allowAutoRedirect = true;

    const response = await client.get(request);

    expect(response.statusCode).toBe(200);
    expect(response.content).toBe("done");
    expect(response.request.url.toString()).toBe("https://api.example.com/books/final");
  });

  it("forces method to GET on a 303 redirect from POST", async () => {
    const redirectHeaders = new HttpHeader();
    redirectHeaders.set("Location", "/books/final");

    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), redirectHeaders, "", 303),
      new HttpResponse(new HttpRequest("https://api.example.com/books/final"), new HttpHeader(), "done", 200),
    ]);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    const request = new HttpRequest("https://api.example.com/books");
    request.method = "POST";
    request.allowAutoRedirect = true;
    request.setContent("body");

    await client.execute(request);

    expect(request.method).toBe("GET");
    expect(request.contentData).toBeNull();
  });

  it("throws after too many redirects", async () => {
    const redirectHeaders = new HttpHeader();
    redirectHeaders.set("Location", "https://api.example.com/loop");

    const responses = Array.from(
      { length: 8 },
      () => new HttpResponse(new HttpRequest("https://api.example.com/loop"), redirectHeaders, "", 302)
    );
    const dispatcher = fakeDispatcher(responses);
    const client = new HttpClient([], noRateLimit(), dispatcher);

    const request = new HttpRequest("https://api.example.com/loop");
    request.allowAutoRedirect = true;

    await expect(client.get(request)).rejects.toThrow(/Too many automatic redirections/);
  });

  it("runs request interceptors' preRequest/postResponse", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), "ok", 200),
    ]);

    const seenRequests: string[] = [];
    const seenResponses: number[] = [];

    const client = new HttpClient(
      [
        {
          preRequest(request) {
            seenRequests.push(request.url.toString());
            return request;
          },
          postResponse(response) {
            seenResponses.push(response.statusCode);
            return response;
          },
        },
      ],
      noRateLimit(),
      dispatcher
    );

    await client.get(new HttpRequest("https://api.example.com/books"));

    expect(seenRequests).toEqual(["https://api.example.com/books"]);
    expect(seenResponses).toEqual([200]);
  });

  it("stores response cookies into the persistent jar and replays them on the next request to the same host", async () => {
    const setCookieHeaders = new HttpHeader();
    setCookieHeaders.add("Set-Cookie", "session=abc123; Path=/");

    let capturedCookieHeader: string | undefined;

    const dispatcher: IHttpDispatcher = {
      getResponse: vi.fn(async (request, cookieJar: CookieJar) => {
        if (request.url.path === "/second") {
          capturedCookieHeader = cookieJar.getCookieHeader(request.url.host);
          return new HttpResponse(request, new HttpHeader(), "ok", 200);
        }

        return new HttpResponse(request, setCookieHeaders, "logged in", 200);
      }),
    };

    const client = new HttpClient([], noRateLimit(), dispatcher);

    const first = new HttpRequest("https://api.example.com/first");
    first.storeResponseCookie = true;
    await client.get(first);

    const second = new HttpRequest("https://api.example.com/second");
    await client.get(second);

    expect(capturedCookieHeader).toBe("session=abc123");
  });

  it("waits on the rate limiter when request.rateLimit is set", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), "ok", 200),
    ]);

    const waitAndPulse = vi.fn(async () => {});
    const rateLimitService = { waitAndPulse };

    const client = new HttpClient([], rateLimitService, dispatcher);

    const request = new HttpRequest("https://api.example.com/books");
    request.rateLimit = 5000;

    await client.get(request);

    expect(waitAndPulse).toHaveBeenCalledWith("api.example.com", null, 5000);
  });

  it("does not call the rate limiter when request.rateLimit is 0", async () => {
    const dispatcher = fakeDispatcher([
      new HttpResponse(new HttpRequest("https://api.example.com/books"), new HttpHeader(), "ok", 200),
    ]);

    const waitAndPulse = vi.fn(async () => {});
    const client = new HttpClient([], { waitAndPulse }, dispatcher);

    await client.get(new HttpRequest("https://api.example.com/books"));

    expect(waitAndPulse).not.toHaveBeenCalled();
  });
});
