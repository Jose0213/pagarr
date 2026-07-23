import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpException } from "../../http/HttpException.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { Gotify } from "../gotify/Gotify.js";
import { GotifyException } from "../gotify/GotifyException.js";
import { GotifyProxy } from "../gotify/GotifyProxy.js";
import { createGotifySettings, validateGotifySettings } from "../gotify/GotifySettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("GotifySettings validation", () => {
  it("requires a valid http(s) Server URL", () => {
    expect(
      validateGotifySettings(createGotifySettings({ server: "", appToken: "t" })).isValid
    ).toBe(false);
    expect(
      validateGotifySettings(createGotifySettings({ server: "not a url", appToken: "t" })).isValid
    ).toBe(false);
    expect(
      validateGotifySettings(createGotifySettings({ server: "ftp://x.com", appToken: "t" })).isValid
    ).toBe(false);
    expect(
      validateGotifySettings(createGotifySettings({ server: "http://x.com", appToken: "t" }))
        .isValid
    ).toBe(true);
  });

  it("requires AppToken", () => {
    const result = validateGotifySettings(
      createGotifySettings({ server: "http://x.com", appToken: "" })
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "AppToken")).toBe(true);
  });
});

describe("GotifyProxy", () => {
  it("posts to {server}/message with token as a query param and form fields for title/message/priority", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new GotifyProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Message",
      createGotifySettings({ server: "http://gotify.local:8080", appToken: "tok", priority: 8 })
    );

    const request = execute.mock.calls[0]![0];
    expect(request.url.toString()).toContain("/message");
    expect(request.url.toString()).toContain("token=tok");
    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toContain("title=Title");
    expect(body).toContain("priority=8");
  });

  it("throws GotifyException('Unauthorized...') on a 401 response", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new GotifyProxy(httpClient);

    await expect(
      proxy.sendNotification(
        "t",
        "m",
        createGotifySettings({ server: "http://x", appToken: "bad" })
      )
    ).rejects.toThrow(GotifyException);
  });
});

describe("Gotify notifier", () => {
  it("test() returns a failure with blank propertyName on error, unlike siblings that delegate to proxy.test()", async () => {
    const proxy = {
      sendNotification: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const notifier = new Gotify(proxy);
    notifier.definition = {
      settings: createGotifySettings({ server: "http://x", appToken: "t" }),
    } as never;

    const result = await notifier.test();
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      { propertyName: "", errorMessage: "Unable to send test message" },
    ]);
  });

  it("test() returns valid on success", async () => {
    const proxy = { sendNotification: vi.fn(async () => {}) };
    const notifier = new Gotify(proxy);
    notifier.definition = {
      settings: createGotifySettings({ server: "http://x", appToken: "t" }),
    } as never;

    const result = await notifier.test();
    expect(result.isValid).toBe(true);
  });

  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Gotify(new GotifyProxy(fakeHttpClientWithOverrides()));
    expect(notifier.supportsOnDownloadFailure).toBe(true);
    expect(notifier.supportsOnImportFailure).toBe(true);
    expect(notifier.supportsOnRename).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
