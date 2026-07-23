import { describe, expect, it, vi } from "vitest";
import { Pushover } from "../pushover/Pushover.js";
import { PushoverPriority } from "../pushover/PushoverPriority.js";
import { PushoverProxy } from "../pushover/PushoverProxy.js";
import {
  createPushoverSettings,
  isPushoverSettingsValid,
  validatePushoverSettings,
} from "../pushover/PushoverSettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("PushoverSettings validation", () => {
  it("requires UserKey", () => {
    const result = validatePushoverSettings(createPushoverSettings({ userKey: "" }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "UserKey")).toBe(true);
  });

  it("is valid with just a UserKey at default (Normal) priority", () => {
    const result = validatePushoverSettings(createPushoverSettings({ userKey: "user" }));
    expect(result.isValid).toBe(true);
  });

  it("requires Retry >= 30 at Emergency priority (first duplicated rule)", () => {
    const result = validatePushoverSettings(
      createPushoverSettings({ userKey: "user", priority: PushoverPriority.Emergency, retry: 10 })
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.filter((e) => e.propertyName === "Retry").length).toBeGreaterThan(0);
  });

  it("does NOT validate Expire at all -- preserved copy-paste bug in the real validator", () => {
    // The real PushoverSettingsValidator declares the Retry rule twice
    // (see PushoverSettings.ts's doc comment) and never validates Expire,
    // even though Expire is a real field sent to the Pushover API. An
    // out-of-range Expire must NOT produce a validation error.
    const result = validatePushoverSettings(
      createPushoverSettings({
        userKey: "user",
        priority: PushoverPriority.Emergency,
        retry: 60,
        expire: 999999,
      })
    );
    expect(result.errors.some((e) => e.propertyName === "Expire")).toBe(false);
    expect(result.isValid).toBe(true);
  });

  it("does not require Retry/Expire bounds outside Emergency priority", () => {
    const result = validatePushoverSettings(
      createPushoverSettings({ userKey: "user", priority: PushoverPriority.Normal, retry: -100 })
    );
    expect(result.isValid).toBe(true);
  });
});

describe("PushoverSettings.IsValid", () => {
  it("requires a non-blank UserKey and priority in [-1, 2]", () => {
    expect(isPushoverSettingsValid(createPushoverSettings({ userKey: "u", priority: 2 }))).toBe(
      true
    );
    expect(isPushoverSettingsValid(createPushoverSettings({ userKey: "", priority: 0 }))).toBe(
      false
    );
    expect(isPushoverSettingsValid(createPushoverSettings({ userKey: "u", priority: -2 }))).toBe(
      false
    );
  });
});

describe("PushoverProxy", () => {
  it("posts form parameters including token/user/device/title/message/priority", async () => {
    const post = vi.fn(async (req) => ({ statusCode: 200, request: req }) as never);
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new PushoverProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Message",
      createPushoverSettings({ apiKey: "key", userKey: "user", devices: ["phone", "tablet"] })
    );

    expect(post).toHaveBeenCalledTimes(1);
    const request = post.mock.calls[0]![0];
    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toContain("token=key");
    expect(body).toContain("user=user");
    expect(body).toContain("device=phone%2Ctablet");
    expect(body).not.toContain("retry=");
  });

  it("adds retry/expire form params only at Emergency priority", async () => {
    const post = vi.fn(async (req) => ({ statusCode: 200, request: req }) as never);
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new PushoverProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Message",
      createPushoverSettings({
        apiKey: "key",
        userKey: "user",
        priority: PushoverPriority.Emergency,
        retry: 60,
        expire: 3600,
      })
    );

    const request = post.mock.calls[0]![0];
    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toContain("retry=60");
    expect(body).toContain("expire=3600");
  });

  it("test() returns an ApiKey failure when sendNotification throws", async () => {
    const httpClient = fakeHttpClientWithOverrides({
      post: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    const proxy = new PushoverProxy(httpClient);

    const failure = await proxy.test(createPushoverSettings({ userKey: "user" }));
    expect(failure).toEqual({
      propertyName: "ApiKey",
      errorMessage: "Unable to send test message",
    });
  });
});

describe("Pushover notifier", () => {
  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Pushover(new PushoverProxy(fakeHttpClientWithOverrides()));

    expect(notifier.supportsOnGrab).toBe(true);
    expect(notifier.supportsOnDownloadFailure).toBe(true);
    expect(notifier.supportsOnImportFailure).toBe(true);
    expect(notifier.supportsOnApplicationUpdate).toBe(true);
    // NOT overridden in the real Pushover.cs.
    expect(notifier.supportsOnRename).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
