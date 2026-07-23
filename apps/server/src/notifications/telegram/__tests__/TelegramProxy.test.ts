import { describe, expect, it } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import { fakeHttpClient, noopLogger } from "../../__tests__/testFixtures.js";
import { TelegramProxy, htmlEncode } from "../TelegramProxy.js";
import { createTelegramSettings } from "../TelegramSettings.js";

describe("htmlEncode", () => {
  it("escapes &, <, >, and \" but NOT ' (matches .NET HttpUtility.HtmlEncode)", () => {
    expect(htmlEncode(`<b>Tom & "Jerry" 'n stuff</b>`)).toBe(
      `&lt;b&gt;Tom &amp; &quot;Jerry&quot; 'n stuff&lt;/b&gt;`
    );
  });
});

describe("TelegramProxy", () => {
  it("sendNotification posts an HTML-formatted, form-encoded message to the bot's sendmessage endpoint", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new TelegramProxy(httpClient, noopLogger());
    const settings = createTelegramSettings({
      botToken: "12345:ABC",
      chatId: "-100999",
      topicId: 5,
      sendSilently: true,
    });

    await proxy.sendNotification("Book Grabbed", "Some <Book> & Title", settings);

    expect(httpClient.calls).toHaveLength(1);
    const request = httpClient.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("https://api.telegram.org/bot12345:ABC/sendmessage");

    const body = new TextDecoder().decode(request.contentData);
    const params = new URLSearchParams(body);
    expect(params.get("chat_id")).toBe("-100999");
    expect(params.get("parse_mode")).toBe("HTML");
    expect(params.get("text")).toBe("<b>Book Grabbed</b>\nSome &lt;Book&gt; &amp; Title");
    expect(params.get("disable_notification")).toBe("true");
    expect(params.get("message_thread_id")).toBe("5");
  });

  describe("test()", () => {
    it("maps a 400 'chat not found' response to the ChatId property", async () => {
      const failingClient = fixedFailureClient(
        400,
        JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: chat not found" })
      );
      const proxy = new TelegramProxy(failingClient, noopLogger());

      const failure = await proxy.test(createTelegramSettings({ botToken: "t", chatId: "c" }));

      expect(failure).toEqual({
        propertyName: "ChatId",
        errorMessage: "Bad Request: chat not found",
      });
    });

    it("maps a 400 'message thread not found' response to the TopicId property", async () => {
      const failingClient = fixedFailureClient(
        400,
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: "Bad Request: message thread not found",
        })
      );
      const proxy = new TelegramProxy(failingClient, noopLogger());

      const failure = await proxy.test(createTelegramSettings({ botToken: "t", chatId: "c" }));

      expect(failure?.propertyName).toBe("TopicId");
    });

    it("falls back to BotToken for a 400 response with an unrecognized description", async () => {
      const failingClient = fixedFailureClient(
        400,
        JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: something else" })
      );
      const proxy = new TelegramProxy(failingClient, noopLogger());

      const failure = await proxy.test(createTelegramSettings({ botToken: "t", chatId: "c" }));

      expect(failure).toEqual({
        propertyName: "BotToken",
        errorMessage: "Bad Request: something else",
      });
    });

    it("falls back to a generic BotToken failure for a non-400 / non-HttpException error", async () => {
      const failingClient = fixedFailureClient(500, "server error");
      const proxy = new TelegramProxy(failingClient, noopLogger());

      const failure = await proxy.test(createTelegramSettings({ botToken: "t", chatId: "c" }));

      expect(failure).toEqual({
        propertyName: "BotToken",
        errorMessage: "Unable to send test message",
      });
    });

    it("returns null when the send succeeds", async () => {
      const httpClient = fakeHttpClient();
      const proxy = new TelegramProxy(httpClient, noopLogger());

      const failure = await proxy.test(createTelegramSettings({ botToken: "t", chatId: "c" }));

      expect(failure).toBeNull();
    });
  });
});

function fixedFailureClient(statusCode: number, content: string) {
  const fail = async (request: never) => {
    const response = new HttpResponse(request, new HttpHeader(), content, statusCode);
    throw new HttpException(request, response);
  };

  return {
    execute: fail,
    get: fail,
    post: fail,
    head: fail,
    getTyped: fail,
    postTyped: fail,
    downloadFile: fail,
  };
}
