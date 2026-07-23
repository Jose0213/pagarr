import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpException } from "../../http/HttpException.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { Ntfy } from "../ntfy/Ntfy.js";
import { NtfyException } from "../ntfy/NtfyException.js";
import { NtfyProxy } from "../ntfy/NtfyProxy.js";
import { createNtfySettings, validateNtfySettings } from "../ntfy/NtfySettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("NtfySettings validation", () => {
  it("requires at least one topic", () => {
    const result = validateNtfySettings(createNtfySettings({ topics: [] }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "Topics")).toBe(true);
  });

  it("rejects reserved topic names", () => {
    const result = validateNtfySettings(createNtfySettings({ topics: ["announcements"] }));
    expect(result.isValid).toBe(false);
  });

  it("rejects topics with invalid characters", () => {
    const result = validateNtfySettings(createNtfySettings({ topics: ["not a valid topic!"] }));
    expect(result.isValid).toBe(false);
  });

  it("requires priority in [1,5]", () => {
    expect(validateNtfySettings(createNtfySettings({ topics: ["t"], priority: 0 })).isValid).toBe(
      false
    );
    expect(validateNtfySettings(createNtfySettings({ topics: ["t"], priority: 6 })).isValid).toBe(
      false
    );
    expect(validateNtfySettings(createNtfySettings({ topics: ["t"], priority: 3 })).isValid).toBe(
      true
    );
  });

  it("requires UserName when Password is set and AccessToken is blank, and vice versa", () => {
    expect(validateNtfySettings(createNtfySettings({ topics: ["t"], password: "p" })).isValid).toBe(
      false
    );
    expect(validateNtfySettings(createNtfySettings({ topics: ["t"], userName: "u" })).isValid).toBe(
      false
    );
    expect(
      validateNtfySettings(createNtfySettings({ topics: ["t"], userName: "u", password: "p" }))
        .isValid
    ).toBe(true);
  });

  it("skips username/password requirement entirely when AccessToken is set", () => {
    const result = validateNtfySettings(
      createNtfySettings({ topics: ["t"], accessToken: "token-only" })
    );
    expect(result.isValid).toBe(true);
  });
});

describe("NtfyProxy", () => {
  it("posts to {serverUrl}/{topic} for every configured topic, using the default server when blank", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new NtfyProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Message",
      createNtfySettings({ topics: ["topic1", "topic2"] })
    );

    expect(execute).toHaveBeenCalledTimes(2);
    const urls = execute.mock.calls.map((c) => c[0].url.toString());
    expect(urls[0]).toContain("https://ntfy.sh/topic1");
    expect(urls[1]).toContain("https://ntfy.sh/topic2");
  });

  it("trims a trailing slash off a custom ServerUrl", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new NtfyProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Message",
      createNtfySettings({ topics: ["topic1"], serverUrl: "https://my.ntfy.example/" })
    );

    const url = execute.mock.calls[0]![0].url.toString();
    expect(url).toContain("https://my.ntfy.example/topic1");
    expect(url).not.toContain("//topic1");
  });

  it("sets an Authorization Bearer header when AccessToken is set (taking priority over user/pass)", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new NtfyProxy(httpClient);

    await proxy.sendNotification(
      "Title",
      "Message",
      createNtfySettings({
        topics: ["topic1"],
        accessToken: "tok",
        userName: "user",
        password: "pass",
      })
    );

    const request = execute.mock.calls[0]![0];
    expect(request.headers.get("Authorization")).toBe("Bearer tok");
    expect(request.credentials).toBeNull();
  });

  it("throws one combined NtfyException when any topic fails", async () => {
    let call = 0;
    const execute = vi.fn(async (req: HttpRequest) => {
      call += 1;
      if (call === 1) {
        const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 500);
        throw new HttpException(req, response);
      }
      return new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new NtfyProxy(httpClient);

    await expect(
      proxy.sendNotification("t", "m", createNtfySettings({ topics: ["topic1", "topic2"] }))
    ).rejects.toThrow(NtfyException);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("test() prefers reporting an invalid AccessToken over username/password on 401/403", async () => {
    const execute = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new NtfyProxy(httpClient);

    const failure = await proxy.test(
      createNtfySettings({ topics: ["t"], accessToken: "bad-token" })
    );
    expect(failure).toEqual({ propertyName: "AccessToken", errorMessage: "Invalid token" });
  });
});

describe("Ntfy notifier", () => {
  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Ntfy(new NtfyProxy(fakeHttpClientWithOverrides()));
    expect(notifier.supportsOnGrab).toBe(true);
    expect(notifier.supportsOnApplicationUpdate).toBe(true);
    // NOT overridden in the real Ntfy.cs.
    expect(notifier.supportsOnDownloadFailure).toBe(false);
    expect(notifier.supportsOnImportFailure).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
