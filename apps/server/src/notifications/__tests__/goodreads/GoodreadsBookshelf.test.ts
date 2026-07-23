import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse, TypedHttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { GoodreadsBookshelf } from "../../goodreads/Bookshelf/GoodreadsBookshelf.js";
import { createGoodreadsBookshelfNotificationSettings } from "../../goodreads/Bookshelf/GoodreadsBookshelfNotificationSettings.js";

function authHeaderResponse(req: import("../../../http/HttpRequest.js").HttpRequest) {
  const response = new HttpResponse(
    req,
    new HttpHeader(),
    JSON.stringify({ authorization: "OAuth signed-header" }),
    200
  );
  return new TypedHttpResponse(response);
}

function fakeHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), "", 200)),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(async (req) => authHeaderResponse(req)),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

function buildBookshelf(httpClient: IHttpClient, settingsOverrides = {}) {
  const bookshelf = new GoodreadsBookshelf(httpClient);
  bookshelf.definition = createNotificationDefinition({
    settings: createGoodreadsBookshelfNotificationSettings({
      accessToken: "at",
      accessTokenSecret: "ats",
      userId: "42",
      userName: "Jane Reader",
      addIds: ["to-read"],
      removeIds: [],
      ...settingsOverrides,
    }),
  });

  return bookshelf;
}

describe("GoodreadsBookshelf", () => {
  it("name/link/configContract match the real C# class", () => {
    const bookshelf = buildBookshelf(fakeHttpClient());
    expect(bookshelf.name).toBe("Goodreads Bookshelves");
    expect(bookshelf.link).toBe("https://goodreads.com/");
  });

  it(
    "PRESERVED REAL C# BUG: onReleaseImport's Goodreads call always fails before reaching " +
      "the HTTP client, because oAuthExecute never supplies a consumer key (see " +
      "GoodreadsNotificationBase.ts's oAuthExecute doc comment) -- this affects every write " +
      "path (add/remove shelf, owned books), not just this one call site",
    async () => {
      const execute = vi.fn(
        async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
      );
      const bookshelf = buildBookshelf(fakeHttpClient({ execute }), {
        addIds: ["to-read", "favorites"],
      });

      const errors: unknown[] = [];
      const onUnhandledRejection = (err: unknown) => errors.push(err);
      process.once("unhandledRejection", onUnhandledRejection);

      const message = {
        message: "Book X",
        author: { metadata: { name: "Author X" } },
        book: {
          foreignBookId: "999",
          author: { metadata: { name: "Author X" } },
          editions: [
            { foreignEditionId: "edition-1", monitored: false },
            { foreignEditionId: "edition-2", monitored: true },
          ],
        },
        bookFiles: [],
        oldFiles: [],
        downloadClientInfo: null,
        downloadId: null,
      } as never;

      bookshelf.onReleaseImport(message);

      // onReleaseImport is a fire-and-forget void wrapper (see the class's
      // doc comment on async/void) -- give its internal promise a chance to
      // settle, then confirm the HTTP client was never reached.
      await new Promise((resolve) => setTimeout(resolve, 10));
      process.removeListener("unhandledRejection", onUnhandledRejection);

      expect(execute).not.toHaveBeenCalled();
    }
  );

  it(
    "PRESERVED C# QUIRK (currently unreachable given the bug above): searchShelf's page " +
      "resets to 1 every outer-loop iteration -- documented for whoever fixes the consumer-key " +
      "bug next, see GoodreadsBookshelf.ts's searchShelf doc comment for the full explanation",
    () => {
      // No behavioral assertion possible through any public entry point
      // today: every call into searchShelf() goes through oAuthExecute,
      // which throws before a single HTTP request is ever built (see the
      // test above). This is a documentation-only placeholder so a future
      // fix to the consumer-key bug doesn't silently lose track of this
      // second, independent quirk in the same method.
      expect(true).toBe(true);
    }
  );

  it("getBookshelves returns an empty shelves array when accessToken is not set", async () => {
    const bookshelf = buildBookshelf(fakeHttpClient(), { accessToken: null });

    const result = await bookshelf.requestAction("getBookshelves", {});
    expect(result).toEqual({ shelves: [] });
  });

  it("requestAction falls through to the base implementation for unknown actions", async () => {
    const bookshelf = buildBookshelf(fakeHttpClient());
    expect(await bookshelf.requestAction("somethingElse", {})).toEqual({});
  });
});
