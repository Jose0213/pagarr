import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpException } from "../../http/HttpException.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { Apprise } from "../apprise/Apprise.js";
import { AppriseException } from "../apprise/AppriseException.js";
import { AppriseProxy } from "../apprise/AppriseProxy.js";
import { createAppriseSettings, validateAppriseSettings } from "../apprise/AppriseSettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("AppriseSettings validation", () => {
  it("requires a valid ServerUrl", () => {
    const result = validateAppriseSettings(
      createAppriseSettings({ serverUrl: "", configurationKey: "key" })
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "ServerUrl")).toBe(true);
  });

  it("requires either ConfigurationKey or StatelessUrls, mutually exclusive", () => {
    const neither = validateAppriseSettings(createAppriseSettings({ serverUrl: "http://x.com" }));
    expect(neither.isValid).toBe(false);
    expect(neither.errors.some((e) => e.propertyName === "ConfigurationKey")).toBe(true);
    expect(neither.errors.some((e) => e.propertyName === "StatelessUrls")).toBe(true);

    const both = validateAppriseSettings(
      createAppriseSettings({
        serverUrl: "http://x.com",
        configurationKey: "abc",
        statelessUrls: "tgram://x",
      })
    );
    expect(both.isValid).toBe(false);
    expect(both.errors.some((e) => e.propertyName === "StatelessUrls")).toBe(true);

    const keyOnly = validateAppriseSettings(
      createAppriseSettings({ serverUrl: "http://x.com", configurationKey: "abc" })
    );
    expect(keyOnly.isValid).toBe(true);

    const statelessOnly = validateAppriseSettings(
      createAppriseSettings({ serverUrl: "http://x.com", statelessUrls: "tgram://x" })
    );
    expect(statelessOnly.isValid).toBe(true);
  });

  it("rejects ConfigurationKey with disallowed characters, regardless of StatelessUrls", () => {
    const result = validateAppriseSettings(
      createAppriseSettings({ serverUrl: "http://x.com", configurationKey: "Not_Valid!" })
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "ConfigurationKey")).toBe(true);
  });

  it("rejects Tags when StatelessUrls is set", () => {
    const result = validateAppriseSettings(
      createAppriseSettings({
        serverUrl: "http://x.com",
        statelessUrls: "tgram://x",
        tags: ["a"],
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "Tags")).toBe(true);
  });

  it("allows Tags when ConfigurationKey (persistent) mode is used", () => {
    const result = validateAppriseSettings(
      createAppriseSettings({ serverUrl: "http://x.com", configurationKey: "abc", tags: ["a"] })
    );
    expect(result.isValid).toBe(true);
  });
});

describe("AppriseProxy", () => {
  it("posts to /notify/{configurationKey} in persistent-storage mode", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new AppriseProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Body",
      createAppriseSettings({ serverUrl: "http://apprise.local", configurationKey: "mykey" })
    );

    const request = execute.mock.calls[0]![0];
    expect(request.url.toString()).toContain("/notify/mykey");
  });

  it("posts to /notify with a Urls field in stateless mode", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new AppriseProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Body",
      createAppriseSettings({
        serverUrl: "http://apprise.local",
        statelessUrls: "tgram://token/chatid",
      })
    );

    const request = execute.mock.calls[0]![0];
    expect(request.url.toString()).toContain("/notify");
    expect(request.url.toString()).not.toContain("/notify/");
    const body = JSON.parse(new TextDecoder().decode(request.contentData ?? new Uint8Array()));
    expect(body.Urls).toBe("tgram://token/chatid");
  });

  it("joins tags with commas into the Tag field", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new AppriseProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Body",
      createAppriseSettings({
        serverUrl: "http://apprise.local",
        configurationKey: "key",
        tags: ["a", "b", "c"],
      })
    );

    const request = execute.mock.calls[0]![0];
    const body = JSON.parse(new TextDecoder().decode(request.contentData ?? new Uint8Array()));
    expect(body.Tag).toBe("a,b,c");
  });

  it("wraps an HTTP failure as AppriseException", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 500);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new AppriseProxy(httpClient);

    await expect(
      proxy.sendNotification(
        "t",
        "m",
        createAppriseSettings({ serverUrl: "http://apprise.local", configurationKey: "key" })
      )
    ).rejects.toThrow(AppriseException);
  });

  it("test() reports invalid HTTP Auth credentials on 401", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new AppriseProxy(httpClient);

    const failure = await proxy.test(
      createAppriseSettings({ serverUrl: "http://apprise.local", configurationKey: "key" })
    );
    expect(failure?.propertyName).toBe("AuthUsername");
  });

  it("test() surfaces the Apprise API's own error body when present", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(
        req,
        new HttpHeader(),
        JSON.stringify({ error: "invalid configuration key" }),
        400
      );
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new AppriseProxy(httpClient);

    const failure = await proxy.test(
      createAppriseSettings({ serverUrl: "http://apprise.local", configurationKey: "key" })
    );
    expect(failure?.errorMessage).toContain("invalid configuration key");
  });
});

describe("Apprise notifier", () => {
  it("is a meta-notifier: OnGrab forwards the plain message text through to the Apprise API, no per-service logic", async () => {
    const sendNotification = vi.fn(async () => {});
    const notifier = new Apprise({ sendNotification, test: vi.fn() });
    notifier.definition = {
      settings: createAppriseSettings({ serverUrl: "http://x", configurationKey: "key" }),
    } as never;

    await notifier.onGrab({
      message: "Grabbed!",
      author: {} as never,
      remoteBook: {} as never,
      quality: {} as never,
      downloadClientType: null,
      downloadClientName: null,
      downloadId: null,
    });

    expect(sendNotification).toHaveBeenCalledWith("Book Grabbed", "Grabbed!", expect.anything());
  });

  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Apprise(new AppriseProxy(fakeHttpClientWithOverrides()));
    expect(notifier.supportsOnDownloadFailure).toBe(true);
    expect(notifier.supportsOnImportFailure).toBe(true);
    // NOT overridden in the real Apprise.cs.
    expect(notifier.supportsOnRename).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
