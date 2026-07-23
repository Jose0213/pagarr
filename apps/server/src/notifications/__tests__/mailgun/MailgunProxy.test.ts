import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import type { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { MailgunProxy } from "../../mailgun/MailgunProxy.js";
import { MailgunException } from "../../mailgun/MailgunException.js";
import { createMailgunSettings } from "../../mailgun/MailgunSettings.js";

function fakeHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    ),
    get: vi.fn(),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

describe("MailgunProxy", () => {
  it("posts form params to the US endpoint by default", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const proxy = new MailgunProxy(fakeHttpClient({ execute }));

    const settings = createMailgunSettings({
      apiKey: "key-test",
      from: "from@example.com",
      senderDomain: "mg.example.com",
      recipients: ["a@example.com", "b@example.com"],
    });

    await proxy.sendNotification("Book Grabbed", "Some Book grabbed", settings);

    expect(execute).toHaveBeenCalledTimes(1);
    const request = execute.mock.calls[0]![0];

    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
    expect(request.credentials).toEqual({ kind: "basic", userName: "api", password: "key-test" });

    const body = new TextDecoder().decode(request.contentData ?? new Uint8Array());
    expect(body).toContain("from=from%40example.com");
    expect(body).toContain("to=a%40example.com");
    expect(body).toContain("to=b%40example.com");
    expect(body).toContain("subject=Book%20Grabbed");
    expect(body).toContain("text=Some%20Book%20grabbed");
  });

  it("posts to the EU endpoint when useEuEndpoint is set", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)
    );
    const proxy = new MailgunProxy(fakeHttpClient({ execute }));

    const settings = createMailgunSettings({
      apiKey: "key-test",
      useEuEndpoint: true,
      from: "from@example.com",
      senderDomain: "mg.example.com",
      recipients: ["a@example.com"],
    });

    await proxy.sendNotification("Title", "Body", settings);

    const request = execute.mock.calls[0]![0];
    expect(request.url.toString()).toBe("https://api.eu.mailgun.net/v3/mg.example.com/messages");
  });

  it("throws MailgunException with a specific message on 401", async () => {
    const execute = vi.fn(async (req) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const proxy = new MailgunProxy(fakeHttpClient({ execute }));

    const settings = createMailgunSettings({
      apiKey: "bad",
      from: "from@example.com",
      senderDomain: "mg.example.com",
      recipients: ["a@example.com"],
    });

    await expect(proxy.sendNotification("Title", "Body", settings)).rejects.toThrow(
      MailgunException
    );
    await expect(proxy.sendNotification("Title", "Body", settings)).rejects.toThrow(/Unauthorised/);
  });
});
