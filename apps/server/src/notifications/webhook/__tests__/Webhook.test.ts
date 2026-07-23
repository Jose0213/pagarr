import { describe, expect, it, vi } from "vitest";
import { Webhook } from "../Webhook.js";
import { WebhookEventType } from "../WebhookEventType.js";
import { WebhookException } from "../WebhookException.js";
import type { IWebhookProxy } from "../WebhookProxy.js";
import { createWebhookSettings } from "../WebhookSettings.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { createAuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import { HealthCheckResult, type HealthCheckLike } from "../../forwardRefs.js";
import { testAuthor, testBook, testBookFile, testEdition } from "../../__tests__/testFixtures.js";

/** webhookBookFromBook requires exactly one monitored edition -- see that function's doc comment. */
function testBookWithMonitoredEdition() {
  return testBook(testAuthor(), { editions: [testEdition({ monitored: true })] });
}

function fakeProxy(overrides: Partial<IWebhookProxy> = {}): IWebhookProxy {
  return {
    sendWebhook: vi.fn(async () => {}),
    ...overrides,
  };
}

function buildNotifier(
  proxy: IWebhookProxy = fakeProxy(),
  instanceName = "pagarr-instance"
): Webhook {
  const notifier = new Webhook(proxy, { instanceName });
  notifier.definition = createNotificationDefinition({
    settings: createWebhookSettings({ url: "https://example.com/hook" }),
  });
  return notifier;
}

describe("Webhook notifier dispatch", () => {
  it("onAuthorAdded sends a WebhookAuthorAddedPayload with eventType AuthorAdded", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    await notifier.onAuthorAdded(testAuthor());

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: WebhookEventType.AuthorAdded }),
      expect.anything()
    );
  });

  it("onAuthorDelete forwards deletedFiles through the payload", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);
    const author = testAuthor();

    await notifier.onAuthorDelete(
      createAuthorDeleteMessage(author, author.metadata?.name ?? "", true)
    );

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: WebhookEventType.AuthorDelete, deletedFiles: true }),
      expect.anything()
    );
  });

  it("onBookDelete builds a payload with the book's author and deletedFiles flag", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    await notifier.onBookDelete(createBookDeleteMessage(testBookWithMonitoredEdition(), true));

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: WebhookEventType.BookDelete, deletedFiles: true }),
      expect.anything()
    );
  });

  it("onBookFileDelete includes the book file in the payload", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);
    const bookFile = testBookFile();

    await notifier.onBookFileDelete({
      message: "",
      book: testBookWithMonitoredEdition(),
      bookFile,
      reason: "Manual" as never,
    });

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: WebhookEventType.BookFileDelete,
        bookFile: expect.objectContaining({ id: bookFile.id }),
      }),
      expect.anything()
    );
  });

  it("onHealthIssue includes level/message/type/wikiUrl", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    const healthCheck: HealthCheckLike = {
      id: 1,
      source: { name: "IndexerRssCheck" },
      type: HealthCheckResult.Warning,
      message: "Indexer unavailable",
      wikiUrl: "https://wiki.example.com/health",
    };

    await notifier.onHealthIssue(healthCheck);

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: WebhookEventType.Health,
        message: "Indexer unavailable",
        type: "IndexerRssCheck",
      }),
      expect.anything()
    );
  });

  it("onApplicationUpdate includes previous/new version strings", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    await notifier.onApplicationUpdate({
      message: "Updated",
      previousVersion: "1.0.0",
      newVersion: "1.1.0",
    });

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: WebhookEventType.ApplicationUpdate,
        previousVersion: "1.0.0",
        newVersion: "1.1.0",
      }),
      expect.anything()
    );
  });

  it("every payload includes instanceName from the config file provider", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy, "my-custom-instance");

    await notifier.onAuthorAdded(testAuthor());

    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: "my-custom-instance" }),
      expect.anything()
    );
  });
});

describe("Webhook.test", () => {
  it("returns valid when sendWebhookTest succeeds", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    const result = await notifier.test();

    expect(result.isValid).toBe(true);
    expect(proxy.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: WebhookEventType.Test }),
      expect.anything()
    );
  });

  it("maps a WebhookException to a Url validation failure", async () => {
    const proxy = fakeProxy({
      sendWebhook: vi.fn(async () => {
        throw new WebhookException("Unable to post to webhook: connection refused");
      }),
    });
    const notifier = buildNotifier(proxy);

    const result = await notifier.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.propertyName).toBe("Url");
  });

  it("re-throws a non-WebhookException error from sendWebhook", async () => {
    const proxy = fakeProxy({
      sendWebhook: vi.fn(async () => {
        throw new TypeError("unexpected");
      }),
    });
    const notifier = buildNotifier(proxy);

    await expect(notifier.test()).rejects.toThrow(TypeError);
  });
});
