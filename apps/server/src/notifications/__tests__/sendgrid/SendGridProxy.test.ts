import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import type { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { SendGridProxy } from "../../sendgrid/SendGridProxy.js";
import { SendGridException } from "../../sendgrid/SendGridException.js";
import { createSendGridSettings } from "../../sendgrid/SendGridSettings.js";

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

describe("SendGridProxy", () => {
  it("posts a JSON payload with from/content/personalizations to mail/send", async () => {
    const execute = vi.fn(
      async (req: HttpRequest) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 202)
    );
    const httpClient = fakeHttpClient({ execute });
    const proxy = new SendGridProxy(httpClient);

    const settings = createSendGridSettings({
      apiKey: "SG.test",
      from: "from@example.com",
      recipients: ["a@example.com", "b@example.com"],
    });

    await proxy.sendNotification("Book Grabbed", "Some Book grabbed", settings);

    expect(execute).toHaveBeenCalledTimes(1);
    const request = execute.mock.calls[0]![0];

    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(request.headers.get("Authorization")).toBe("Bearer SG.test");
    expect(request.headers.contentType).toBe("application/json");

    const payload = JSON.parse(
      new TextDecoder().decode(request.contentData ?? new Uint8Array())
    ) as {
      from: unknown;
      content: unknown;
      personalizations: unknown;
    };
    expect(payload.from).toEqual({ email: "from@example.com" });
    expect(payload.content).toEqual([{ type: "text/plain", value: "Some Book grabbed" }]);
    expect(payload.personalizations).toEqual([
      {
        subject: "Book Grabbed",
        to: [{ email: "a@example.com" }, { email: "b@example.com" }],
      },
    ]);
  });

  it("throws SendGridException with a specific message on 401", async () => {
    const execute = vi.fn(async (req) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 401);
      throw new HttpException(req, response);
    });
    const proxy = new SendGridProxy(fakeHttpClient({ execute }));

    const settings = createSendGridSettings({
      apiKey: "bad-key",
      from: "from@example.com",
      recipients: ["a@example.com"],
    });

    await expect(proxy.sendNotification("Title", "Body", settings)).rejects.toThrow(
      SendGridException
    );
    await expect(proxy.sendNotification("Title", "Body", settings)).rejects.toThrow(/Unauthorized/);
  });

  it("throws a generic SendGridException on other HTTP errors", async () => {
    const execute = vi.fn(async (req) => {
      const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 500);
      throw new HttpException(req, response);
    });
    const proxy = new SendGridProxy(fakeHttpClient({ execute }));

    const settings = createSendGridSettings({
      apiKey: "key",
      from: "from@example.com",
      recipients: ["a@example.com"],
    });

    await expect(proxy.sendNotification("Title", "Body", settings)).rejects.toThrow(
      /Status Code: 500/
    );
  });
});
