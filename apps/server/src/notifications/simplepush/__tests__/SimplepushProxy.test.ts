import { describe, expect, it } from "vitest";
import { fakeHttpClient, noopLogger } from "../../__tests__/testFixtures.js";
import { SimplepushProxy } from "../SimplepushProxy.js";
import { createSimplepushSettings } from "../SimplepushSettings.js";

describe("SimplepushProxy", () => {
  it("posts a form-encoded key/event/title/msg to api.simplepush.io/send", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SimplepushProxy(httpClient, noopLogger());
    const settings = createSimplepushSettings({ key: "my-key", event: "my-event" });

    await proxy.sendNotification("Book Grabbed", "Some Book", settings);

    expect(httpClient.calls).toHaveLength(1);
    const request = httpClient.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("https://api.simplepush.io/send");

    const params = new URLSearchParams(new TextDecoder().decode(request.contentData));
    expect(params.get("key")).toBe("my-key");
    expect(params.get("event")).toBe("my-event");
    expect(params.get("title")).toBe("Book Grabbed");
    expect(params.get("msg")).toBe("Some Book");
  });

  it("test() always returns a generic ApiKey failure on any error, regardless of cause", async () => {
    const failingClient = {
      execute: async () => {
        throw new Error("network exploded");
      },
      get: async () => {
        throw new Error("unused");
      },
      post: async () => {
        throw new Error("network exploded");
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

    const proxy = new SimplepushProxy(failingClient, noopLogger());
    const failure = await proxy.test(createSimplepushSettings({ key: "k" }));

    expect(failure).toEqual({
      propertyName: "ApiKey",
      errorMessage: "Unable to send test message",
    });
  });

  it("test() returns null on success", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SimplepushProxy(httpClient, noopLogger());

    const failure = await proxy.test(createSimplepushSettings({ key: "k" }));

    expect(failure).toBeNull();
  });
});
