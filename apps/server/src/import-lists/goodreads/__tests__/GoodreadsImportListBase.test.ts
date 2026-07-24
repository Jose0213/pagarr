import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { createImportListDefinition } from "../../ImportListDefinition.js";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import { GoodreadsBookshelf } from "../bookshelf/GoodreadsBookshelf.js";
import { createGoodreadsBookshelfImportListSettings } from "../bookshelf/GoodreadsBookshelfImportListSettings.js";

/**
 * Proves the real C# bug documented in `GoodreadsImportListBase.ts`'s doc
 * comment: `OAuthGet` signs every protected-resource request with
 * `ForProtectedResource(..., null, null, ...)` (no consumer key/secret),
 * which the shared `OAuthRequest.getAuthorizationHeader()` ->
 * `validateState()` unconditionally rejects for `ProtectedResource`-type
 * requests. This is the SAME bug already proven for
 * `notifications/goodreads/__tests__/GoodreadsNotificationBase.test.ts`
 * (Notifications' own Goodreads integration), independently confirmed here
 * for ImportLists' Goodreads integration -- exercised through
 * `GoodreadsBookshelf` (a concrete `GoodreadsImportListBase` subclass)
 * since the base class itself is abstract.
 */
function fakeStatusService(): IImportListStatusService {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastSyncListInfo: vi.fn(() => null),
    updateListSyncStatus: vi.fn(),
  };
}

function neverCalledHttpClient(): IHttpClient {
  const fail = vi.fn(async () => {
    throw new Error("HTTP should never be reached -- OAuthGet throws before any request is sent");
  });
  return {
    execute: fail,
    get: fail,
    head: fail,
    post: fail,
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

function buildSubject() {
  const subject = new GoodreadsBookshelf(
    fakeStatusService(),
    undefined as never,
    undefined,
    neverCalledHttpClient()
  );
  subject.definition = createImportListDefinition({
    id: 3,
    name: "Goodreads Bookshelves",
    settings: createGoodreadsBookshelfImportListSettings({
      accessToken: "real-token",
      accessTokenSecret: "real-secret",
      userId: "12345",
      bookshelfIds: ["read"],
    }),
  });
  return subject;
}

describe("GoodreadsImportListBase (via GoodreadsBookshelf) -- preserved OAuthGet consumer-key bug", () => {
  it("getReviews (via fetch()) never reaches the HTTP client -- OAuthGet throws first, caught, and yields zero items", async () => {
    const subject = buildSubject();

    // GoodreadsBookshelf.getReviews/getShelfList each catch generic Exception
    // and return an empty list -- matching that class's own `catch (Exception
    // ex) { _logger.Warn(...); return new List<...>(); }` branches. The bug
    // doesn't crash the whole fetch, it just silently makes it return nothing,
    // every time, regardless of how valid the configured tokens are.
    const items = await subject.fetch();

    expect(items).toEqual([]);
  });

  it("getUser (via test()) surfaces the consumer-key error as a validation failure", async () => {
    const subject = buildSubject();

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.errorMessage).toContain("Unable to connect to import list");
  });

  it("the underlying OAuthRequest.getAuthorizationHeader throws exactly 'You must specify a consumer key' for a ProtectedResource request", async () => {
    const { OAuthRequest } = await import("../../../notifications/_shared/oauth1.js");

    const auth = OAuthRequest.forProtectedResource("GET", null, null, "real-token", "real-secret");
    auth.requestUrl = "https://www.goodreads.com/api/auth_user";

    expect(() => auth.getAuthorizationHeader({})).toThrow(/consumer key/i);
  });
});
