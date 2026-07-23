import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { Join } from "../join/Join.js";
import { JoinAuthException, JoinInvalidDeviceException } from "../join/JoinException.js";
import { JoinProxy } from "../join/JoinProxy.js";
import { createJoinSettings, validateJoinSettings } from "../join/JoinSettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("JoinSettings validation", () => {
  it("requires ApiKey", () => {
    const result = validateJoinSettings(createJoinSettings({ apiKey: "" }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "ApiKey")).toBe(true);
  });

  it("rejects a non-empty DeviceIds (deprecated field)", () => {
    const result = validateJoinSettings(
      createJoinSettings({ apiKey: "key", deviceIds: "123,456" })
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "DeviceIds")).toBe(true);
  });

  it("is valid with just an ApiKey and no DeviceIds", () => {
    const result = validateJoinSettings(createJoinSettings({ apiKey: "key" }));
    expect(result.isValid).toBe(true);
  });
});

describe("JoinProxy", () => {
  function jsonResponse(body: unknown) {
    return vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), JSON.stringify(body), 200)
    );
  }

  it("sends a GET request with deviceNames when set (preferred over deviceIds)", async () => {
    const execute = jsonResponse({ success: true });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new JoinProxy(httpClient);

    await proxy.sendNotification(
      "title",
      "message",
      createJoinSettings({ apiKey: "key", deviceNames: "Phone,Tablet" })
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const request = execute.mock.calls[0]![0];
    expect(request.method).toBe("GET");
    expect(request.url.toString()).toContain("deviceNames=Phone%2CTablet");
    expect(request.url.toString()).not.toContain("deviceId=group.all");
  });

  it("falls back to deviceId=group.all when neither deviceNames nor deviceIds are set", async () => {
    const execute = jsonResponse({ success: true });
    const httpClient = fakeHttpClientWithOverrides({ execute });
    const proxy = new JoinProxy(httpClient);

    await proxy.sendNotification("title", "message", createJoinSettings({ apiKey: "key" }));

    const request = execute.mock.calls[0]![0];
    expect(request.url.toString()).toContain("deviceId=group.all");
  });

  it("throws JoinAuthException on userAuthError", async () => {
    const httpClient = fakeHttpClientWithOverrides({
      execute: jsonResponse({ success: false, userAuthError: true }),
    });
    const proxy = new JoinProxy(httpClient);

    await expect(
      proxy.sendNotification("title", "message", createJoinSettings({ apiKey: "bad" }))
    ).rejects.toThrow(JoinAuthException);
  });

  it("throws JoinInvalidDeviceException for the hardcoded 'No devices to send to' error string", async () => {
    const httpClient = fakeHttpClientWithOverrides({
      execute: jsonResponse({ success: false, errorMessage: "No devices to send to" }),
    });
    const proxy = new JoinProxy(httpClient);

    await expect(
      proxy.sendNotification("title", "message", createJoinSettings({ apiKey: "key" }))
    ).rejects.toThrow(JoinInvalidDeviceException);
  });

  it("treats the singular 'No device to send message to' error as an auth failure", async () => {
    const httpClient = fakeHttpClientWithOverrides({
      execute: jsonResponse({ success: false, errorMessage: "No device to send message to" }),
    });
    const proxy = new JoinProxy(httpClient);

    await expect(
      proxy.sendNotification("title", "message", createJoinSettings({ apiKey: "key" }))
    ).rejects.toThrow(JoinAuthException);
  });

  it("test() returns a DeviceIds validation failure for an invalid-device error", async () => {
    const httpClient = fakeHttpClientWithOverrides({
      execute: jsonResponse({ success: false, errorMessage: "No devices to send to" }),
    });
    const proxy = new JoinProxy(httpClient);

    const failure = await proxy.test(createJoinSettings({ apiKey: "key" }));
    expect(failure).toEqual({
      propertyName: "DeviceIds",
      errorMessage: "Device IDs appear invalid.",
    });
  });

  it("test() returns null on success", async () => {
    const httpClient = fakeHttpClientWithOverrides({ execute: jsonResponse({ success: true }) });
    const proxy = new JoinProxy(httpClient);

    const failure = await proxy.test(createJoinSettings({ apiKey: "key" }));
    expect(failure).toBeNull();
  });
});

describe("Join notifier", () => {
  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Join(new JoinProxy(fakeHttpClientWithOverrides()));

    expect(notifier.supportsOnGrab).toBe(true);
    expect(notifier.supportsOnReleaseImport).toBe(true);
    expect(notifier.supportsOnAuthorAdded).toBe(true);
    expect(notifier.supportsOnAuthorDelete).toBe(true);
    expect(notifier.supportsOnBookDelete).toBe(true);
    expect(notifier.supportsOnBookFileDelete).toBe(true);
    expect(notifier.supportsOnHealthIssue).toBe(true);
    expect(notifier.supportsOnApplicationUpdate).toBe(true);

    // NOT overridden in the real Join.cs.
    expect(notifier.supportsOnRename).toBe(false);
    expect(notifier.supportsOnDownloadFailure).toBe(false);
    expect(notifier.supportsOnImportFailure).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });

  it("onGrab sends the branded grab title and message", async () => {
    const sendNotification = vi.fn(async () => {});
    const notifier = new Join({ sendNotification, test: vi.fn() });
    notifier.definition = { settings: createJoinSettings({ apiKey: "key" }) } as never;

    await notifier.onGrab({
      message: "Some Book Grabbed",
      author: { id: 1 } as never,
      remoteBook: {} as never,
      quality: {} as never,
      downloadClientType: null,
      downloadClientName: null,
      downloadId: null,
    });

    expect(sendNotification).toHaveBeenCalledWith(
      "Readarr - Book Grabbed",
      "Some Book Grabbed",
      expect.anything()
    );
  });
});
