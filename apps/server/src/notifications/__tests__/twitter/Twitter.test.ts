import { describe, expect, it, vi } from "vitest";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { BadRequestException } from "../../../exceptions/BadRequestException.js";
import { Twitter } from "../../twitter/Twitter.js";
import { createTwitterSettings } from "../../twitter/TwitterSettings.js";
import type { ITwitterService } from "../../twitter/TwitterService.js";

function fakeService(overrides: Partial<ITwitterService> = {}): ITwitterService {
  return {
    sendNotification: vi.fn(async () => {}),
    test: vi.fn(async () => null),
    getOAuthRedirect: vi.fn(async () => "https://api.twitter.com/oauth/authorize?oauth_token=x"),
    getOAuthToken: vi.fn(async () => ({ accessToken: "at", accessTokenSecret: "ats" })),
    ...overrides,
  };
}

function buildTwitter(service: ITwitterService, settingsOverrides = {}) {
  const twitter = new Twitter(service);
  twitter.definition = createNotificationDefinition({
    settings: createTwitterSettings({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
      mention: "someuser",
      ...settingsOverrides,
    }),
  });

  return twitter;
}

describe("Twitter notifier", () => {
  it("onGrab sends a 'Grabbed: ' prefixed message", () => {
    const sendNotification = vi.fn(async () => {});
    const twitter = buildTwitter(fakeService({ sendNotification }));

    twitter.onGrab({ message: "Book X" } as never);

    expect(sendNotification).toHaveBeenCalledWith(
      "Grabbed: Book X",
      expect.objectContaining({ consumerKey: "ck" })
    );
  });

  it("onAuthorAdded uses the author's metadata name", () => {
    const sendNotification = vi.fn(async () => {});
    const twitter = buildTwitter(fakeService({ sendNotification }));

    twitter.onAuthorAdded({ metadata: { name: "Brandon Sanderson" } } as never);

    expect(sendNotification).toHaveBeenCalledWith(
      "Author added: Brandon Sanderson",
      expect.anything()
    );
  });

  it("requestAction startOAuth throws BadRequestException without a callbackUrl", async () => {
    const twitter = buildTwitter(fakeService());

    await expect(twitter.requestAction("startOAuth", {})).rejects.toThrow(BadRequestException);
  });

  it("requestAction startOAuth returns the oauthUrl from the service", async () => {
    const getOAuthRedirect = vi.fn(
      async () => "https://api.twitter.com/oauth/authorize?oauth_token=abc"
    );
    const twitter = buildTwitter(fakeService({ getOAuthRedirect }));

    const result = await twitter.requestAction("startOAuth", {
      callbackUrl: "https://example.com/cb",
    });

    expect(result).toEqual({ oauthUrl: "https://api.twitter.com/oauth/authorize?oauth_token=abc" });
    expect(getOAuthRedirect).toHaveBeenCalledWith("ck", "cs", "https://example.com/cb");
  });

  it("requestAction getOAuthToken throws BadRequestException without oauth_token", async () => {
    const twitter = buildTwitter(fakeService());

    await expect(twitter.requestAction("getOAuthToken", { oauth_verifier: "v" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("requestAction getOAuthToken returns the access token pair", async () => {
    const getOAuthToken = vi.fn(async () => ({
      accessToken: "newAt",
      accessTokenSecret: "newAts",
    }));
    const twitter = buildTwitter(fakeService({ getOAuthToken }));

    const result = await twitter.requestAction("getOAuthToken", {
      oauth_token: "reqtoken",
      oauth_verifier: "v",
    });

    expect(result).toEqual({ accessToken: "newAt", accessTokenSecret: "newAts" });
  });

  it("requestAction returns {} for an unrecognized action", async () => {
    const twitter = buildTwitter(fakeService());
    expect(await twitter.requestAction("somethingElse", {})).toEqual({});
  });

  it("requestAction throws when consumerKey/consumerSecret are missing (Filter+ThrowOnError ported)", async () => {
    const twitter = buildTwitter(fakeService(), { consumerKey: "", consumerSecret: "" });

    await expect(
      twitter.requestAction("startOAuth", { callbackUrl: "https://example.com/cb" })
    ).rejects.toThrow(BadRequestException);
  });

  it("test() delegates to the service and reports failures", async () => {
    const test = vi.fn(async () => ({
      propertyName: "Host",
      errorMessage: "Unable to send test message",
    }));
    const twitter = buildTwitter(fakeService({ test }));

    const result = await twitter.test();

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("test() reports success when the service returns null", async () => {
    const twitter = buildTwitter(fakeService({ test: vi.fn(async () => null) }));

    const result = await twitter.test();

    expect(result.isValid).toBe(true);
  });
});
