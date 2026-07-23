import { describe, expect, it } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import { fakeHttpClient, noopLogger } from "../../__tests__/testFixtures.js";
import { DiscordProxy } from "../DiscordProxy.js";
import { DiscordException } from "../DiscordException.js";
import { createDiscordSettings } from "../DiscordSettings.js";

describe("DiscordProxy", () => {
  it("posts the payload as JSON to the configured webhook URL", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new DiscordProxy(httpClient, noopLogger());
    const settings = createDiscordSettings({
      webHookUrl: "https://discord.com/api/webhooks/1/token",
    });

    await proxy.sendPayload({ content: "hello" }, settings);

    expect(httpClient.calls).toHaveLength(1);
    const request = httpClient.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("https://discord.com/api/webhooks/1/token");
    expect(request.headers.contentType).toBe("application/json");
    expect(new TextDecoder().decode(request.contentData)).toBe(
      JSON.stringify({ content: "hello" })
    );
  });

  it("wraps an HttpException as DiscordException, matching the C# catch/rethrow", async () => {
    const failingClient = {
      execute: async (request: never) => {
        const response = new HttpResponse(request, new HttpHeader(), "server error", 500);
        throw new HttpException(request, response);
      },
      get: async () => {
        throw new Error("unused");
      },
      post: async () => {
        throw new Error("unused");
      },
      head: async () => {
        throw new Error("unused");
      },
      getTyped: async () => {
        throw new Error("unused");
      },
      postTyped: async () => {
        throw new Error("unused");
      },
      downloadFile: async () => {
        throw new Error("unused");
      },
    };

    const proxy = new DiscordProxy(failingClient, noopLogger());
    const settings = createDiscordSettings({
      webHookUrl: "https://discord.com/api/webhooks/1/token",
    });

    await expect(proxy.sendPayload({ content: "hi" }, settings)).rejects.toBeInstanceOf(
      DiscordException
    );
  });
});
