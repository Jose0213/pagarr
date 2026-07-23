/**
 * Minimal fake IHttpClient for metadata-source provider tests. Providers
 * depend on the `IHttpClient` interface (../../http/index.ts), not the
 * concrete `HttpClient` class, so tests can supply a queue of canned
 * `HttpResponse`s without needing a fake dispatcher/rate-limiter (see
 * http/__tests__/HttpClient.test.ts for that lower-level pattern, used
 * when testing HttpClient itself -- not needed here since these tests
 * exercise provider/mapper logic, not the HTTP layer).
 */

import { vi } from "vitest";
import { HttpHeader, HttpResponse, type HttpRequest, type IHttpClient } from "../../http/index.js";

export interface QueuedResponse {
  status?: number;
  body: unknown;
}

export interface FakeHttpClient extends IHttpClient {
  requests: HttpRequest[];
}

/**
 * Builds a fake IHttpClient that returns each queued response in order
 * (by call to `get`/`post`, whichever is invoked -- providers in this
 * module only ever use one or the other per request). Throws if more
 * calls are made than responses were queued, so tests fail loudly on an
 * unexpected extra request instead of hanging or returning undefined.
 * Every request made is recorded on `.requests` for assertions (auth
 * headers, query params, GraphQL body, etc).
 */
export function fakeHttpClient(responses: QueuedResponse[]): FakeHttpClient {
  const queue = [...responses];
  const requests: HttpRequest[] = [];

  const respond = async (request: HttpRequest): Promise<HttpResponse> => {
    requests.push(request);
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(
        `fakeHttpClient: ran out of queued responses (request: ${request.url.toString()})`
      );
    }
    const body = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    const headers = new HttpHeader();
    headers.contentType = "application/json";
    return new HttpResponse(request, headers, body, next.status ?? 200);
  };

  return {
    requests,
    execute: vi.fn(respond),
    get: vi.fn(respond),
    post: vi.fn(respond),
    head: vi.fn(respond),
    downloadFile: vi.fn(async () => {}),
    getTyped: vi.fn(async (request: HttpRequest) => {
      const response = await respond(request);
      return Object.assign(response, { resource: JSON.parse(response.content) }) as never;
    }),
    postTyped: vi.fn(async (request: HttpRequest) => {
      const response = await respond(request);
      return Object.assign(response, { resource: JSON.parse(response.content) }) as never;
    }),
  };
}
