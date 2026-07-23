import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpException } from "../../http/HttpException.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { createNotificationDefinition } from "../NotificationDefinition.js";
import { Notifiarr } from "../notifiarr/Notifiarr.js";
import { NotifiarrException } from "../notifiarr/NotifiarrException.js";
import { NotifiarrProxy } from "../notifiarr/NotifiarrProxy.js";
import {
  createNotifiarrSettings,
  validateNotifiarrSettings,
} from "../notifiarr/NotifiarrSettings.js";
import { WebhookEventType } from "../webhook/WebhookEventType.js";
import { fakeAuthor, fakeBook, fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("NotifiarrSettings validation", () => {
  it("requires APIKey", () => {
    expect(validateNotifiarrSettings(createNotifiarrSettings({ apiKey: "" })).isValid).toBe(false);
    expect(validateNotifiarrSettings(createNotifiarrSettings({ apiKey: "k" })).isValid).toBe(true);
  });
});

describe("NotifiarrProxy", () => {
  it("posts JSON with an X-API-Key header to /api/v1/notification/readarr", async () => {
    const post = vi.fn(async (req: HttpRequest) => ({ statusCode: 200, request: req }) as never);
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new NotifiarrProxy(httpClient);

    await proxy.sendNotification(
      { eventType: WebhookEventType.Test, instanceName: "Readarr" },
      createNotifiarrSettings({ apiKey: "key" })
    );

    const request = post.mock.calls[0]![0];
    expect(request.url.toString()).toContain("/api/v1/notification/readarr");
    expect(request.headers.get("X-API-Key")).toBe("key");
    expect(request.headers.contentType).toBe("application/json");
    const body = JSON.parse(new TextDecoder().decode(request.contentData ?? new Uint8Array()));
    expect(body.eventType).toBe("Test");
  });

  it("throws NotifiarrException('API key is invalid') on 401", async () => {
    const post = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new NotifiarrProxy(httpClient);

    await expect(
      proxy.sendNotification(
        { eventType: WebhookEventType.Test, instanceName: "Readarr" },
        createNotifiarrSettings({ apiKey: "bad" })
      )
    ).rejects.toThrow(NotifiarrException);
  });

  it("swallows a 400 (Readarr integration misconfiguration) without throwing", async () => {
    const post = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 400);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new NotifiarrProxy(httpClient);

    await expect(
      proxy.sendNotification(
        { eventType: WebhookEventType.Test, instanceName: "Readarr" },
        createNotifiarrSettings({ apiKey: "key" })
      )
    ).resolves.toBeUndefined();
  });

  it("throws NotifiarrException on 503 (service unavailable)", async () => {
    const post = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 503);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new NotifiarrProxy(httpClient);

    await expect(
      proxy.sendNotification(
        { eventType: WebhookEventType.Test, instanceName: "Readarr" },
        createNotifiarrSettings({ apiKey: "key" })
      )
    ).rejects.toThrow(NotifiarrException);
  });

  it("throws a Cloudflare-flavored NotifiarrException on 522", async () => {
    const post = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 522);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new NotifiarrProxy(httpClient);

    await expect(
      proxy.sendNotification(
        { eventType: WebhookEventType.Test, instanceName: "Readarr" },
        createNotifiarrSettings({ apiKey: "key" })
      )
    ).rejects.toThrow(/Cloudflare/);
  });
});

describe("Notifiarr notifier payload building", () => {
  it("onAuthorAdded builds a WebhookAuthorAddedPayload with the resolved author name/goodreadsId", async () => {
    const sendNotification = vi.fn(async () => {});
    const notifier = new Notifiarr({ sendNotification }, { instanceName: "Readarr" });
    notifier.definition = createNotificationDefinition({
      settings: createNotifiarrSettings({ apiKey: "key" }),
    });

    const author = fakeAuthor();
    await notifier.onAuthorAdded(author);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = sendNotification.mock.calls[0]![0] as {
      eventType: string;
      instanceName: string;
      author: { id: number; name: string; goodreadsId: string };
    };
    expect(payload.eventType).toBe(WebhookEventType.AuthorAdded);
    expect(payload.instanceName).toBe("Readarr");
    expect(payload.author.name).toBe("Test Author");
    expect(payload.author.goodreadsId).toBe("goodreads-author-1");
  });

  it("onBookDelete carries deletedFiles through from the message", async () => {
    const sendNotification = vi.fn(async () => {});
    const notifier = new Notifiarr({ sendNotification }, { instanceName: "Readarr" });
    notifier.definition = createNotificationDefinition({
      settings: createNotifiarrSettings({ apiKey: "key" }),
    });

    const book = fakeBook({
      author: fakeAuthor(),
      // webhookBookFromBook (real WebhookBase's payload builder) requires
      // exactly one monitored edition -- see that function's doc comment.
      editions: [
        {
          id: 1,
          bookId: 1,
          foreignEditionId: "edition-1",
          titleSlug: "test-edition",
          isbn13: null,
          asin: null,
          title: "Test Edition",
          language: null,
          overview: "",
          format: null,
          isEbook: false,
          disambiguation: null,
          publisher: null,
          pageCount: 0,
          releaseDate: null,
          images: [],
          links: [],
          ratings: { votes: 0, value: 0 },
          monitored: true,
          manualAdd: false,
        },
      ],
    });
    await notifier.onBookDelete({
      message: "Test Book - Book removed and all files were deleted",
      book,
      deletedFiles: true,
      deletedFilesMessage: "Book removed and all files were deleted",
    });

    const payload = sendNotification.mock.calls[0]![0] as {
      deletedFiles: boolean;
      book: { title: string };
    };
    expect(payload.deletedFiles).toBe(true);
    expect(payload.book.title).toBe("Test Book");
  });

  it("test() converts a NotifiarrException into an APIKey validation failure", async () => {
    const sendNotification = vi.fn(async () => {
      throw new NotifiarrException("API key is invalid");
    });
    const notifier = new Notifiarr({ sendNotification }, { instanceName: "Readarr" });
    notifier.definition = createNotificationDefinition({
      settings: createNotifiarrSettings({ apiKey: "bad" }),
    });

    const result = await notifier.test();
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([{ propertyName: "APIKey", errorMessage: "API key is invalid" }]);
  });

  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Notifiarr(new NotifiarrProxy(fakeHttpClientWithOverrides()), {
      instanceName: "Readarr",
    });
    expect(notifier.supportsOnGrab).toBe(true);
    expect(notifier.supportsOnReleaseImport).toBe(true);
    expect(notifier.supportsOnHealthIssue).toBe(true);
    expect(notifier.supportsOnApplicationUpdate).toBe(true);
    // NOT overridden in the real Notifiarr.cs.
    expect(notifier.supportsOnRename).toBe(false);
    expect(notifier.supportsOnDownloadFailure).toBe(false);
    expect(notifier.supportsOnImportFailure).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
