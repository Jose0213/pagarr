import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import { TwitterService } from "../../twitter/TwitterService.js";
import { TwitterException } from "../../twitter/TwitterException.js";
import { createTwitterSettings } from "../../twitter/TwitterSettings.js";
import type { ITwitterProxy } from "../../twitter/TwitterProxy.js";

function fakeProxy(overrides: Partial<ITwitterProxy> = {}): ITwitterProxy {
  return {
    getOAuthToken: vi.fn(),
    getOAuthRedirect: vi.fn(),
    updateStatus: vi.fn(async () => {}),
    directMessage: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("TwitterService", () => {
  it("sends a direct message when settings.directMessage is true", async () => {
    const directMessage = vi.fn(async () => {});
    const service = new TwitterService(fakeProxy({ directMessage }));

    const settings = createTwitterSettings({ directMessage: true, mention: "someuser" });
    await service.sendNotification("hello", settings);

    expect(directMessage).toHaveBeenCalledWith("hello", settings);
  });

  it("appends @mention and posts a status update when directMessage is false", async () => {
    const updateStatus = vi.fn(async () => {});
    const service = new TwitterService(fakeProxy({ updateStatus }));

    const settings = createTwitterSettings({ directMessage: false, mention: "someuser" });
    await service.sendNotification("hello", settings);

    expect(updateStatus).toHaveBeenCalledWith("hello @someuser", settings);
  });

  it("does not append a mention when none is configured", async () => {
    const updateStatus = vi.fn(async () => {});
    const service = new TwitterService(fakeProxy({ updateStatus }));

    const settings = createTwitterSettings({ directMessage: false, mention: null });
    await service.sendNotification("hello", settings);

    expect(updateStatus).toHaveBeenCalledWith("hello", settings);
  });

  it("wraps an HttpException from the proxy into a TwitterException", async () => {
    const request = new HttpRequest("https://api.twitter.com/1.1/statuses/update.json");
    const response = new HttpResponse(request, new HttpHeader(), "rate limited", 429);
    const httpException = new HttpException(request, response);

    const updateStatus = vi.fn(async () => {
      throw httpException;
    });
    const service = new TwitterService(fakeProxy({ updateStatus }));

    const settings = createTwitterSettings({ directMessage: false });

    await expect(service.sendNotification("hello", settings)).rejects.toThrow(TwitterException);
    await expect(service.sendNotification("hello", settings)).rejects.toThrow(/rate limited/);
  });

  it("test() returns a validation failure when sendNotification throws", async () => {
    const updateStatus = vi.fn(async () => {
      throw new Error("boom");
    });
    const service = new TwitterService(fakeProxy({ updateStatus }));

    const settings = createTwitterSettings({ directMessage: false });
    const failure = await service.test(settings);

    expect(failure).toEqual({ propertyName: "Host", errorMessage: "Unable to send test message" });
  });

  it("test() returns null when sendNotification succeeds", async () => {
    const service = new TwitterService(fakeProxy());
    const settings = createTwitterSettings({ directMessage: true });

    expect(await service.test(settings)).toBeNull();
  });
});
