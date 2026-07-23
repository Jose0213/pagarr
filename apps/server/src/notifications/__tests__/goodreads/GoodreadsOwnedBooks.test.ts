import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse, TypedHttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { GoodreadsOwnedBooks } from "../../goodreads/OwnedBooks/GoodreadsOwnedBooks.js";
import {
  createGoodreadsOwnedBooksNotificationSettings,
  OwnedBookCondition,
} from "../../goodreads/OwnedBooks/GoodreadsOwnedBooksNotificationSettings.js";

function fakeHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), "", 200)),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(async (req) => {
      const response = new HttpResponse(
        req,
        new HttpHeader(),
        JSON.stringify({ authorization: "OAuth signed-header" }),
        200
      );
      return new TypedHttpResponse(response);
    }),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

function buildOwnedBooks(httpClient: IHttpClient, settingsOverrides = {}) {
  const notification = new GoodreadsOwnedBooks(httpClient);
  notification.definition = createNotificationDefinition({
    settings: createGoodreadsOwnedBooksNotificationSettings({
      accessToken: "at",
      accessTokenSecret: "ats",
      ...settingsOverrides,
    }),
  });

  return notification;
}

describe("GoodreadsOwnedBooks", () => {
  it("name/link match the real C# class", () => {
    const notification = buildOwnedBooks(fakeHttpClient());
    expect(notification.name).toBe("Goodreads Owned Books");
    expect(notification.link).toBe("https://goodreads.com/");
  });

  it(
    "PRESERVED REAL C# BUG: onReleaseImport's Goodreads call always fails before reaching " +
      "the HTTP client, because oAuthExecute never supplies a consumer key (see " +
      "GoodreadsNotificationBase.ts's oAuthExecute doc comment)",
    async () => {
      const execute = vi.fn(
        async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
      );
      const notification = buildOwnedBooks(fakeHttpClient({ execute }), {
        condition: OwnedBookCondition.LikeNew,
      });

      const message = {
        message: "x",
        author: {},
        book: {
          editions: [
            { foreignEditionId: "e1", monitored: false },
            { foreignEditionId: "e2", monitored: true },
          ],
        },
        bookFiles: [],
        oldFiles: [],
        downloadClientInfo: null,
        downloadId: null,
      } as never;

      // onReleaseImport is a fire-and-forget void wrapper (see the class's
      // doc comment on async/void) -- swallow the expected unhandled
      // rejection here rather than letting it escape as a process-level
      // event during the test run.
      const onUnhandledRejection = () => {};
      process.once("unhandledRejection", onUnhandledRejection);

      notification.onReleaseImport(message);
      await new Promise((resolve) => setTimeout(resolve, 10));

      process.removeListener("unhandledRejection", onUnhandledRejection);
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it("onReleaseImport does nothing when no edition is monitored", async () => {
    const execute = vi.fn(
      async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const notification = buildOwnedBooks(fakeHttpClient({ execute }));

    const message = {
      message: "x",
      author: {},
      book: { editions: [{ foreignEditionId: "e1", monitored: false }] },
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    } as never;

    notification.onReleaseImport(message);

    // Give any stray microtask a chance to run, then assert nothing fired.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("GoodreadsOwnedBooksNotificationSettings", () => {
  it("defaults condition to BrandNew", () => {
    expect(createGoodreadsOwnedBooksNotificationSettings().condition).toBe(
      OwnedBookCondition.BrandNew
    );
  });
});
