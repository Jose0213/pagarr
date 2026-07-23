import { describe, expect, it, vi } from "vitest";
import { WebhookProxy } from "../WebhookProxy.js";
import { WebhookException } from "../WebhookException.js";
import { WebhookMethod } from "../WebhookMethod.js";
import { WebhookEventType } from "../WebhookEventType.js";
import { createWebhookSettings } from "../WebhookSettings.js";
import { HttpException } from "../../../http/HttpException.js";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import type { IHttpClient } from "../../../http/HttpClient.js";

const payload = { eventType: WebhookEventType.Test, instanceName: "pagarr-test" };

function fakeHttpClient(execute: IHttpClient["execute"]): IHttpClient {
  return {
    execute,
    get: vi.fn(),
    getTyped: vi.fn(),
    head: vi.fn(),
    post: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

describe("WebhookProxy.sendWebhook", () => {
  it("uses POST for WebhookMethod.POST", async () => {
    let capturedMethod: string | undefined;
    const client = fakeHttpClient(async (req) => {
      capturedMethod = req.method;
      return new HttpResponse(req, new HttpHeader(), null, 200);
    });
    const proxy = new WebhookProxy(client);
    const settings = createWebhookSettings({
      url: "https://example.com/hook",
      method: WebhookMethod.POST,
    });

    await proxy.sendWebhook(payload, settings);

    expect(capturedMethod).toBe("POST");
  });

  it("uses PUT for WebhookMethod.PUT", async () => {
    let capturedMethod: string | undefined;
    const client = fakeHttpClient(async (req) => {
      capturedMethod = req.method;
      return new HttpResponse(req, new HttpHeader(), null, 200);
    });
    const proxy = new WebhookProxy(client);
    const settings = createWebhookSettings({
      url: "https://example.com/hook",
      method: WebhookMethod.PUT,
    });

    await proxy.sendWebhook(payload, settings);

    expect(capturedMethod).toBe("PUT");
  });

  it("throws RangeError for an invalid method value", async () => {
    const client = fakeHttpClient(
      async (req) => new HttpResponse(req, new HttpHeader(), null, 200)
    );
    const proxy = new WebhookProxy(client);
    const settings = createWebhookSettings({ url: "https://example.com/hook", method: 99 });

    await expect(proxy.sendWebhook(payload, settings)).rejects.toThrow(RangeError);
  });

  it("sets BasicNetworkCredential when username or password is set", async () => {
    let capturedRequest: HttpRequest | undefined;
    const client = fakeHttpClient(async (req) => {
      capturedRequest = req;
      return new HttpResponse(req, new HttpHeader(), null, 200);
    });
    const proxy = new WebhookProxy(client);
    const settings = createWebhookSettings({
      url: "https://example.com/hook",
      username: "user",
      password: "pass",
    });

    await proxy.sendWebhook(payload, settings);

    expect(capturedRequest?.credentials).toEqual({
      kind: "basic",
      userName: "user",
      password: "pass",
    });
  });

  it("wraps an HttpException as a WebhookException", async () => {
    const client = fakeHttpClient(async (req) => {
      const response = new HttpResponse(req, new HttpHeader(), null, 500);
      throw new HttpException(req, response);
    });
    const proxy = new WebhookProxy(client);
    const settings = createWebhookSettings({ url: "https://example.com/hook" });

    await expect(proxy.sendWebhook(payload, settings)).rejects.toThrow(WebhookException);
  });

  it("serializes the payload body as JSON with content-type application/json", async () => {
    let capturedRequest: HttpRequest | undefined;
    const client = fakeHttpClient(async (req) => {
      capturedRequest = req;
      return new HttpResponse(req, new HttpHeader(), null, 200);
    });
    const proxy = new WebhookProxy(client);
    const settings = createWebhookSettings({ url: "https://example.com/hook" });

    await proxy.sendWebhook(payload, settings);

    expect(capturedRequest?.headers.contentType).toBe("application/json");
    const body = capturedRequest?.contentData
      ? JSON.parse(Buffer.from(capturedRequest.contentData).toString("utf8"))
      : null;
    expect(body).toEqual(payload);
  });
});
