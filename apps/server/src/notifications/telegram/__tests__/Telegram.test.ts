import { describe, expect, it, vi } from "vitest";
import { testAuthor } from "../../__tests__/testFixtures.js";
import type { NotificationDefinition } from "../../NotificationDefinition.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import type { GrabMessage } from "../../GrabMessage.js";
import type { BookDownloadMessage } from "../../BookDownloadMessage.js";
import { HealthCheckResult, type HealthCheckLike } from "../../forwardRefs.js";
import { Telegram } from "../Telegram.js";
import { createTelegramSettings } from "../TelegramSettings.js";
import type { ITelegramProxy } from "../TelegramProxy.js";

function buildSubject(proxy: ITelegramProxy) {
  const subject = new Telegram(proxy);
  subject.definition = createNotificationDefinition<ReturnType<typeof createTelegramSettings>>({
    id: 1,
    name: "Telegram",
    implementationName: "Telegram",
    implementation: "Telegram",
    configContract: "TelegramSettings",
    enable: true,
    settings: createTelegramSettings({ botToken: "t", chatId: "c" }),
  });
  return subject;
}

/** Fills in GrabMessage's required-but-nullable fields this test suite doesn't exercise. */
function grabMessage(overrides: Pick<GrabMessage, "message" | "author">): GrabMessage {
  return {
    remoteBook: null,
    quality: null,
    downloadClientType: null,
    downloadClientName: null,
    downloadId: null,
    ...overrides,
  };
}

/** Fills in BookDownloadMessage's required-but-nullable fields this test suite doesn't exercise. */
function bookDownloadMessage(
  overrides: Pick<BookDownloadMessage, "message" | "author">
): BookDownloadMessage {
  return {
    book: null,
    bookFiles: null,
    oldFiles: null,
    downloadClientInfo: null,
    downloadId: null,
    ...overrides,
  };
}

describe("Telegram", () => {
  it("delegates every On* handler to proxy.sendNotification with the branded title constant", async () => {
    const sendNotification = vi.fn(async () => {});
    const subject = buildSubject({ sendNotification, test: vi.fn() });

    await subject.onGrab(grabMessage({ message: "grabbed msg", author: testAuthor() }));
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Book Grabbed",
      "grabbed msg",
      subject.definition.settings
    );

    await subject.onReleaseImport(
      bookDownloadMessage({ message: "imported msg", author: testAuthor() })
    );
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Book Downloaded",
      "imported msg",
      subject.definition.settings
    );

    await subject.onAuthorAdded(testAuthor({}, "Ursula K. Le Guin"));
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Author Added",
      "Ursula K. Le Guin",
      subject.definition.settings
    );

    const healthCheck: HealthCheckLike = {
      id: 1,
      source: { name: "x" },
      type: HealthCheckResult.Warning,
      message: "health msg",
      wikiUrl: null,
    };
    await subject.onHealthIssue(healthCheck);
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Health Check Failure",
      "health msg",
      subject.definition.settings
    );

    await subject.onApplicationUpdate({
      message: "app update msg",
      previousVersion: "1",
      newVersion: "2",
    });
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Application Updated",
      "app update msg",
      subject.definition.settings
    );
  });

  it("supports exactly the events Telegram.cs overrides (no OnRename/OnBookRetag)", () => {
    const subject = buildSubject({ sendNotification: vi.fn(), test: vi.fn() });
    expect(subject.supportsOnGrab).toBe(true);
    expect(subject.supportsOnRename).toBe(false);
    expect(subject.supportsOnBookRetag).toBe(false);
    expect(subject.supportsOnAuthorAdded).toBe(true);
  });

  it("test() surfaces the proxy's validation failure", async () => {
    const test = vi.fn(async () => ({ propertyName: "ChatId", errorMessage: "bad chat" }));
    const subject = buildSubject({ sendNotification: vi.fn(), test });

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([{ propertyName: "ChatId", errorMessage: "bad chat" }]);
  });
});
