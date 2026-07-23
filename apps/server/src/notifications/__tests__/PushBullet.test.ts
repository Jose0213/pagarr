import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { PushBullet } from "../pushbullet/PushBullet.js";
import { PushBulletException } from "../pushbullet/PushBulletException.js";
import { PushBulletProxy } from "../pushbullet/PushBulletProxy.js";
import {
  createPushBulletSettings,
  validatePushBulletSettings,
} from "../pushbullet/PushBulletSettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("PushBulletSettings validation", () => {
  it("requires ApiKey", () => {
    const result = validatePushBulletSettings(createPushBulletSettings({ apiKey: "" }));
    expect(result.isValid).toBe(false);
  });
});

describe("PushBulletProxy", () => {
  it("sends to all devices when no channelTags/deviceIds are set", async () => {
    const execute = vi.fn(
      async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    await proxy.sendNotification("Title", "Body", createPushBulletSettings({ apiKey: "key" }));

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("fans out to every channelTag, preferring channels over deviceIds", async () => {
    const execute = vi.fn(
      async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Body",
      createPushBulletSettings({
        apiKey: "key",
        channelTags: ["chan1", "chan2"],
        deviceIds: ["should-be-ignored"],
      })
    );

    expect(execute).toHaveBeenCalledTimes(2);
    const bodies = execute.mock.calls.map((c) =>
      new TextDecoder().decode((c[0] as HttpRequest).contentData ?? new Uint8Array())
    );
    expect(bodies[0]).toContain("channel_tag=chan1");
    expect(bodies[1]).toContain("channel_tag=chan2");
  });

  it("uses device_id for a numeric-looking device ID and device_iden otherwise", async () => {
    const execute = vi.fn(
      async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Body",
      createPushBulletSettings({ apiKey: "key", deviceIds: ["12345", "iden-abc"] })
    );

    const bodies = execute.mock.calls.map((c) =>
      new TextDecoder().decode((c[0] as HttpRequest).contentData ?? new Uint8Array())
    );
    expect(bodies[0]).toContain("device_id=12345");
    expect(bodies[1]).toContain("device_iden=iden-abc");
  });

  it("collects per-target failures and throws one combined exception if any target failed", async () => {
    let call = 0;
    const execute = vi.fn(async (req: HttpRequest) => {
      call += 1;
      if (call === 1) {
        const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
        throw new HttpException(req, response);
      }
      return new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    // First channel fails with 401 -> proxy rethrows immediately (matches
    // the real C#'s "Access token is invalid" rethrow branch, not caught
    // by the per-target PushBulletException catch).
    await expect(
      proxy.sendNotification(
        "Title",
        "Body",
        createPushBulletSettings({ apiKey: "key", channelTags: ["chan1", "chan2"] })
      )
    ).rejects.toThrow(HttpException);
  });

  it("wraps a non-401 HTTP failure as PushBulletException and combines multiple failures", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 500);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    await expect(
      proxy.sendNotification(
        "Title",
        "Body",
        createPushBulletSettings({ apiKey: "key", channelTags: ["chan1", "chan2"] })
      )
    ).rejects.toThrow(PushBulletException);
  });

  it("getDevices returns an empty list (not throwing) on non-401 failures", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 500);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    const devices = await proxy.getDevices(createPushBulletSettings({ apiKey: "key" }));
    expect(devices).toEqual([]);
  });

  it("getDevices rethrows on 401", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new PushBulletProxy(httpClient);

    await expect(proxy.getDevices(createPushBulletSettings({ apiKey: "key" }))).rejects.toThrow(
      HttpException
    );
  });
});

describe("PushBullet notifier requestAction('getDevices')", () => {
  it("returns an empty device list without calling the proxy when ApiKey is blank", async () => {
    const getDevices = vi.fn(async () => []);
    const notifier = new PushBullet({
      sendNotification: vi.fn(),
      getDevices,
      test: vi.fn(),
    });
    notifier.definition = { settings: createPushBulletSettings({ apiKey: "" }) } as never;

    const result = notifier.requestAction("getDevices", {});
    expect(result).toEqual({ devices: [] });
    expect(getDevices).not.toHaveBeenCalled();
  });

  it("returns devices sorted case-insensitively by nickname, filtering blank nicknames", async () => {
    const getDevices = vi.fn(async () => [
      { iden: "1", nickname: "zebra", manufacturer: null, model: null },
      { iden: "2", nickname: "Apple", manufacturer: null, model: null },
      { iden: "3", nickname: "", manufacturer: null, model: null },
    ]);
    const notifier = new PushBullet({
      sendNotification: vi.fn(),
      getDevices,
      test: vi.fn(),
    });
    notifier.definition = { settings: createPushBulletSettings({ apiKey: "key" }) } as never;

    const result = (await notifier.requestAction("getDevices", {})) as {
      options: Array<{ id: string; name: string | null }>;
    };

    expect(result.options.map((o) => o.name)).toEqual(["Apple", "zebra"]);
  });

  it("returns an empty object for any other action", () => {
    const notifier = new PushBullet({
      sendNotification: vi.fn(),
      getDevices: vi.fn(),
      test: vi.fn(),
    });
    notifier.definition = { settings: createPushBulletSettings({ apiKey: "key" }) } as never;

    expect(notifier.requestAction("somethingElse", {})).toEqual({});
  });
});

describe("PushBullet notifier support flags", () => {
  it("matches the real class's overridden On* methods, including RequestAction", () => {
    const notifier = new PushBullet(new PushBulletProxy(fakeHttpClientWithOverrides()));

    expect(notifier.supportsOnGrab).toBe(true);
    expect(notifier.supportsOnHealthIssue).toBe(true);
    expect(notifier.supportsOnRename).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
