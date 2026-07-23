import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpException } from "../../http/HttpException.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import { Prowl } from "../prowl/Prowl.js";
import { ProwlException } from "../prowl/ProwlException.js";
import { ProwlProxy } from "../prowl/ProwlProxy.js";
import {
  createProwlSettings,
  isProwlSettingsValid,
  validateProwlSettings,
} from "../prowl/ProwlSettings.js";
import { fakeHttpClientWithOverrides } from "./testFixtures.js";

describe("ProwlSettings validation", () => {
  it("requires ApiKey", () => {
    expect(validateProwlSettings(createProwlSettings({ apiKey: "" })).isValid).toBe(false);
    expect(validateProwlSettings(createProwlSettings({ apiKey: "key" })).isValid).toBe(true);
  });

  it("IsValid checks ApiKey + priority bounds [-2,2]", () => {
    expect(isProwlSettingsValid(createProwlSettings({ apiKey: "k", priority: 2 }))).toBe(true);
    expect(isProwlSettingsValid(createProwlSettings({ apiKey: "k", priority: 3 }))).toBe(false);
    expect(isProwlSettingsValid(createProwlSettings({ apiKey: "", priority: 0 }))).toBe(false);
  });
});

describe("ProwlProxy", () => {
  it("posts form parameters with application name 'Readarr'", async () => {
    const post = vi.fn(async (req: HttpRequest) => ({ statusCode: 200, request: req }) as never);
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new ProwlProxy(httpClient);

    await proxy.sendNotification(
      "Event Title",
      "Description",
      createProwlSettings({ apiKey: "key" })
    );

    const request = post.mock.calls[0]![0];
    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toContain("apikey=key");
    expect(body).toContain("application=Readarr");
    expect(body).toContain("event=Event%20Title");
  });

  it("throws a ProwlException('Apikey is invalid') on 401", async () => {
    const post = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new ProwlProxy(httpClient);

    await expect(
      proxy.sendNotification("t", "m", createProwlSettings({ apiKey: "bad" }))
    ).rejects.toThrow(ProwlException);
  });

  it("wraps a non-HttpException failure as a connection-failure ProwlException", async () => {
    const post = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new ProwlProxy(httpClient);

    await expect(
      proxy.sendNotification("t", "m", createProwlSettings({ apiKey: "key" }))
    ).rejects.toThrow(/Failed to connect to prowl/);
  });

  it("test() reports the underlying error message under ApiKey", async () => {
    const post = vi.fn(async (req: HttpRequest) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const httpClient = fakeHttpClientWithOverrides({ post });
    const proxy = new ProwlProxy(httpClient);

    const failure = await proxy.test(createProwlSettings({ apiKey: "bad" }));
    expect(failure?.propertyName).toBe("ApiKey");
    expect(failure?.errorMessage).toBe("Apikey is invalid");
  });
});

describe("Prowl notifier", () => {
  it("declares support flags matching the real class's overridden On* methods", () => {
    const notifier = new Prowl(new ProwlProxy(fakeHttpClientWithOverrides()));
    expect(notifier.supportsOnGrab).toBe(true);
    expect(notifier.supportsOnHealthIssue).toBe(true);
    expect(notifier.supportsOnApplicationUpdate).toBe(true);
    // NOT overridden in the real Prowl.cs.
    expect(notifier.supportsOnDownloadFailure).toBe(false);
    expect(notifier.supportsOnImportFailure).toBe(false);
    expect(notifier.supportsOnBookRetag).toBe(false);
  });
});
