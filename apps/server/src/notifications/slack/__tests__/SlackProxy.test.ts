import { describe, expect, it } from "vitest";
import { fakeHttpClient, noopLogger } from "../../__tests__/testFixtures.js";
import { SlackProxy } from "../SlackProxy.js";
import { createSlackSettings } from "../SlackSettings.js";

describe("SlackProxy", () => {
  it("posts the payload as JSON to the configured webhook URL", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SlackProxy(httpClient, noopLogger());
    const settings = createSlackSettings({ webHookUrl: "https://hooks.slack.com/services/x" });

    await proxy.sendPayload({ text: "hi" }, settings);

    expect(httpClient.calls).toHaveLength(1);
    const request = httpClient.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.headers.contentType).toBe("application/json");
    expect(new TextDecoder().decode(request.contentData)).toBe(JSON.stringify({ text: "hi" }));
  });
});
