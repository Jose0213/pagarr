import { describe, expect, it, vi } from "vitest";
import { testAuthor, testBook } from "../../__tests__/testFixtures.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../../BookDownloadMessage.js";
import type { NotificationDefinition } from "../../NotificationDefinition.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { Slack } from "../Slack.js";
import { createSlackSettings } from "../SlackSettings.js";
import type { ISlackProxy } from "../SlackProxy.js";

function buildSubject(
  proxy: ISlackProxy,
  overrides: Partial<ReturnType<typeof createSlackSettings>> = {}
) {
  const subject = new Slack(proxy);
  subject.definition = createNotificationDefinition<ReturnType<typeof createSlackSettings>>({
    id: 1,
    name: "Slack",
    implementationName: "Slack",
    implementation: "Slack",
    configContract: "SlackSettings",
    enable: true,
    settings: createSlackSettings({
      webHookUrl: "https://hooks.slack.com/services/x",
      username: "readarr",
      ...overrides,
    }),
  });
  return subject;
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

describe("Slack", () => {
  it("OnBookDelete: preserves the literal '$' before BOTH the author name and the book title (C# quirk, distinct from Discord's)", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });
    const author = testAuthor({}, "N.K. Jemisin");
    const book = testBook(author, { title: "The Fifth Season" });

    await subject.onBookDelete(createBookDeleteMessage(book, false));

    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.attachments[0].title).toBe("$N.K. Jemisin - $The Fifth Season");
    expect(payload.attachments[0].text).toBe("Book removed, files were not deleted");
  });

  it("OnImportFailure: attachment has no title set (unlike Discord's, which falls back to book title)", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });

    await subject.onImportFailure(bookDownloadMessage({ message: "boom", author: testAuthor() }));

    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.attachments[0].title).toBeUndefined();
    expect(payload.attachments[0].fallback).toBe("boom");
    expect(payload.attachments[0].color).toBe("warning");
  });

  it("OnBookRetag: outer payload text is the bare BOOK_RETAGGED_TITLE constant, not an interpolated message (unlike Discord's)", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });
    const author = testAuthor();
    const book = testBook(author);

    await subject.onBookRetag({
      message: "tags updated",
      author,
      book,
      bookFile: { id: 1, path: "/x" } as never,
      diff: {},
      scrubbed: false,
    });

    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.text).toBe("Book File Tags Updated");
    expect(payload.attachments[0].title).toBe("Book File Tags Updated");
    expect(payload.attachments[0].text).toBe("tags updated");
  });

  describe("icon handling", () => {
    it("routes an emoji-shorthand icon (':smile:') to icon_emoji", async () => {
      const sendPayload = vi.fn(async () => {});
      const subject = buildSubject({ sendPayload }, { icon: ":smile:" });

      await subject.onAuthorAdded(testAuthor());

      const [payload] = sendPayload.mock.calls[0]!;
      expect(payload.icon_emoji).toBe(":smile:");
      expect(payload.icon_url).toBeUndefined();
    });

    it("routes a URL icon to icon_url", async () => {
      const sendPayload = vi.fn(async () => {});
      const subject = buildSubject({ sendPayload }, { icon: "https://example.com/icon.png" });

      await subject.onAuthorAdded(testAuthor());

      const [payload] = sendPayload.mock.calls[0]!;
      expect(payload.icon_url).toBe("https://example.com/icon.png");
      expect(payload.icon_emoji).toBeUndefined();
    });

    it("omits both icon fields when icon is blank", async () => {
      const sendPayload = vi.fn(async () => {});
      const subject = buildSubject({ sendPayload }, { icon: "" });

      await subject.onAuthorAdded(testAuthor());

      const [payload] = sendPayload.mock.calls[0]!;
      expect(payload.icon_url).toBeUndefined();
      expect(payload.icon_emoji).toBeUndefined();
    });
  });

  it("sets channel only when settings.channel is non-blank", async () => {
    const sendPayload = vi.fn(async () => {});
    const withChannel = buildSubject({ sendPayload }, { channel: "#releases" });
    const withoutChannel = buildSubject({ sendPayload }, { channel: "" });

    await withChannel.onAuthorAdded(testAuthor());
    await withoutChannel.onAuthorAdded(testAuthor());

    expect(sendPayload.mock.calls[0]![0].channel).toBe("#releases");
    expect(sendPayload.mock.calls[1]![0].channel).toBeUndefined();
  });
});
