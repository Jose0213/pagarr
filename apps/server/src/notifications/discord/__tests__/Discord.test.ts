import { describe, expect, it, vi } from "vitest";
import { testAuthor, testBook } from "../../__tests__/testFixtures.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import { HealthCheckResult } from "../../forwardRefs.js";
import type { GrabMessage } from "../../GrabMessage.js";
import { Discord } from "../Discord.js";
import { DiscordColors } from "../DiscordColors.js";
import { DiscordException } from "../DiscordException.js";
import { createDiscordSettings } from "../DiscordSettings.js";
import type { IDiscordProxy } from "../DiscordProxy.js";
import type { NotificationDefinition } from "../../NotificationDefinition.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";

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

function buildSubject(
  proxy: IDiscordProxy,
  overrides: Partial<ReturnType<typeof createDiscordSettings>> = {}
) {
  const subject = new Discord(proxy);
  subject.definition = createNotificationDefinition<ReturnType<typeof createDiscordSettings>>({
    id: 1,
    name: "Discord",
    implementationName: "Discord",
    implementation: "Discord",
    configContract: "DiscordSettings",
    enable: true,
    settings: createDiscordSettings({
      webHookUrl: "https://discord.com/api/webhooks/1/t",
      ...overrides,
    }),
  });
  return subject;
}

describe("Discord", () => {
  it("supports the events its C# subclass overrides, and nothing else", () => {
    const subject = buildSubject({ sendPayload: vi.fn() });
    expect(subject.supportsOnGrab).toBe(true);
    expect(subject.supportsOnReleaseImport).toBe(true);
    expect(subject.supportsOnRename).toBe(true);
    expect(subject.supportsOnAuthorAdded).toBe(true);
    expect(subject.supportsOnAuthorDelete).toBe(true);
    expect(subject.supportsOnBookDelete).toBe(true);
    expect(subject.supportsOnBookFileDelete).toBe(true);
    expect(subject.supportsOnHealthIssue).toBe(true);
    expect(subject.supportsOnBookRetag).toBe(true);
    expect(subject.supportsOnDownloadFailure).toBe(true);
    expect(subject.supportsOnImportFailure).toBe(true);
    expect(subject.supportsOnApplicationUpdate).toBe(true);
    // Discord.cs never overrides OnRename's underlying "does it fire" semantics
    // differently, but it also doesn't implement OnBookRetag's "SupportsOn..." via
    // ProcessQueue -- there is no queueing notifier in this module's scope.
  });

  it("OnGrab: builds a single warning-colored embed from the grab message", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });
    const author = testAuthor();

    await subject.onGrab(grabMessage({ message: "Some Book grabbed", author }));

    expect(sendPayload).toHaveBeenCalledTimes(1);
    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.content).toBe("Grabbed: Some Book grabbed");
    expect(payload.embeds).toEqual([
      {
        description: "Some Book grabbed",
        title: "Brandon Sanderson",
        text: "Some Book grabbed",
        color: DiscordColors.Warning,
      },
    ]);
  });

  it("OnBookDelete: preserves the literal '$' before the book title (C# quirk)", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });
    const author = testAuthor({}, "N.K. Jemisin");
    const book = testBook(author, { title: "The Fifth Season" });
    const deleteMessage = createBookDeleteMessage(book, true);

    await subject.onBookDelete(deleteMessage);

    const [payload] = sendPayload.mock.calls[0]!;
    // Only ONE literal "$" -- before the title, not the author (unlike Slack's).
    expect(payload.embeds[0].title).toBe("N.K. Jemisin - $The Fifth Season");
    expect(payload.embeds[0].description).toBe("Book removed and all files were deleted");
  });

  it("OnAuthorAdded: joins links as markdown-style '[name](url)' separated by ' / '", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });
    const author = testAuthor({
      metadata: {
        ...testAuthor().metadata!,
        name: "Robin Hobb",
        links: [
          { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Robin_Hobb" },
          { name: "Website", url: "https://robinhobb.com" },
        ],
      },
    });

    await subject.onAuthorAdded(author);

    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.embeds[0].fields).toEqual([
      {
        name: "Links",
        value:
          "[Wikipedia](https://en.wikipedia.org/wiki/Robin_Hobb) / [Website](https://robinhobb.com)",
      },
    ]);
  });

  it("OnHealthIssue: warning maps to Warning color, everything else maps to Danger", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });

    await subject.onHealthIssue({
      id: 1,
      source: { name: "SomeCheck" },
      type: HealthCheckResult.Warning,
      message: "warn msg",
      wikiUrl: null,
    });
    await subject.onHealthIssue({
      id: 2,
      source: { name: "SomeCheck" },
      type: HealthCheckResult.Error,
      message: "error msg",
      wikiUrl: null,
    });

    expect(sendPayload.mock.calls[0]![0].embeds[0].color).toBe(DiscordColors.Warning);
    expect(sendPayload.mock.calls[1]![0].embeds[0].color).toBe(DiscordColors.Danger);
  });

  it("OnApplicationUpdate: passes null content and falls back to hostname when Author setting is blank", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload }, { author: "" });

    await subject.onApplicationUpdate({
      message: "updated",
      previousVersion: "1.0.0",
      newVersion: "1.1.0",
    });

    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.content).toBeNull();
    expect(payload.embeds[0].fields).toEqual([
      { name: "Previous Version", value: "1.0.0" },
      { name: "New Version", value: "1.1.0" },
    ]);
    // hostname() is environment-dependent -- just assert it's non-empty and used.
    expect(payload.embeds[0].author.name).toBeTruthy();
  });

  it("OnApplicationUpdate: uses the Author setting when provided (not the hostname)", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload }, { author: "my-custom-host" });

    await subject.onApplicationUpdate({
      message: "updated",
      previousVersion: "1.0.0",
      newVersion: "1.1.0",
    });

    const [payload] = sendPayload.mock.calls[0]!;
    expect(payload.embeds[0].author.name).toBe("my-custom-host");
  });

  it("createPayload: sets avatar_url only when settings.avatar is non-blank", async () => {
    const sendPayload = vi.fn(async () => {});
    const withAvatar = buildSubject({ sendPayload }, { avatar: "https://example.com/a.png" });
    const withoutAvatar = buildSubject({ sendPayload }, { avatar: "" });

    await withAvatar.onGrab(grabMessage({ message: "m", author: testAuthor() }));
    await withoutAvatar.onGrab(grabMessage({ message: "m", author: testAuthor() }));

    expect(sendPayload.mock.calls[0]![0].avatar_url).toBe("https://example.com/a.png");
    expect(sendPayload.mock.calls[1]![0].avatar_url).toBeUndefined();
  });

  it("test(): returns a validation failure carrying the DiscordException message when the proxy throws", async () => {
    const sendPayload = vi.fn(async () => {
      throw new DiscordException("Unable to post payload");
    });
    const subject = buildSubject({ sendPayload });

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      { propertyName: "Unable to post", errorMessage: "Unable to post payload" },
    ]);
  });

  it("test(): passes when the proxy succeeds", async () => {
    const sendPayload = vi.fn(async () => {});
    const subject = buildSubject({ sendPayload });

    const result = await subject.test();

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
