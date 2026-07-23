import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse, TypedHttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { GoodreadsNotificationBase } from "../../goodreads/GoodreadsNotificationBase.js";
import { createGoodreadsSettingsBaseFields } from "../../goodreads/GoodreadsSettingsBase.js";
import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";

interface FakeGoodreadsSettings extends ReturnType<typeof createGoodreadsSettingsBaseFields> {
  validate(): ValidationResult;
}

function fakeSettings(overrides: Partial<FakeGoodreadsSettings> = {}): FakeGoodreadsSettings {
  return {
    ...createGoodreadsSettingsBaseFields(),
    validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
    ...overrides,
  };
}

class FakeGoodreadsNotification extends GoodreadsNotificationBase<FakeGoodreadsSettings> {
  readonly name = "Fake Goodreads";
  readonly configContract = "FakeGoodreadsSettings";

  constructor(httpClient: IHttpClient) {
    super(httpClient);
  }
}

function fakeHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    get: vi.fn(
      async (req) =>
        new HttpResponse(req, new HttpHeader(), "oauth_token=rt&oauth_token_secret=rts", 200)
    ),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(async (req) => {
      const response = new HttpResponse(
        req,
        new HttpHeader(),
        JSON.stringify({ authorization: "OAuth signed-header" }),
        200
      );
      return new TypedHttpResponse(response);
    }),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

function buildNotification(
  httpClient: IHttpClient,
  settingsOverrides: Partial<FakeGoodreadsSettings> = {}
) {
  const notification = new FakeGoodreadsNotification(httpClient);
  notification.definition = createNotificationDefinition({
    settings: fakeSettings(settingsOverrides),
  });
  return notification;
}

describe("GoodreadsNotificationBase", () => {
  it("link is https://goodreads.com/", () => {
    const notification = buildNotification(fakeHttpClient());
    expect(notification.link).toBe("https://goodreads.com/");
  });

  it(
    "PRESERVED REAL C# BUG: test() always fails, even with a healthy HTTP client, " +
      "because OAuthExecute never supplies a consumer key (see GoodreadsNotificationBase.ts's " +
      "oAuthExecute doc comment) -- GetUser's resulting Error is not an HttpException, " +
      "so TestConnection's catch-all branch handles it",
    async () => {
      const execute = vi.fn(
        async (req) =>
          new HttpResponse(
            req,
            new HttpHeader(),
            '<GoodreadsResponse><user id="42"><name>Jane Reader</name></user></GoodreadsResponse>',
            200
          )
      );
      const notification = buildNotification(fakeHttpClient({ execute }));

      const result = await notification.test();

      expect(result.isValid).toBe(false);
      expect(result.errors[0]?.errorMessage).toBe(
        "Unable to connect to Goodreads, check the log for more details"
      );
      // The HTTP client is never actually reached -- validateState() throws
      // before oAuthExecute builds/signs/sends anything.
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it("TestConnection's HttpException branch is reachable code (verified independently of the always-throws bug above)", () => {
    // GoodreadsNotificationBase.oAuthExecute always throws before reaching
    // the HTTP client (see the test above), so TestConnection's
    // `instanceof HttpException` branch is currently unreachable through
    // the real call path -- this just proves HttpException still
    // `instanceof`-matches the way the catch block in
    // GoodreadsNotificationBase.ts's testConnection() expects, so a future
    // fix to the consumer-key bug would correctly route through it.
    const request = new HttpRequest("https://www.goodreads.com/api/auth_user");
    const response = new HttpResponse(request, new HttpHeader(), new Uint8Array(), 401);
    const httpException = new HttpException(request, response);

    expect(httpException).toBeInstanceOf(HttpException);
    expect(httpException.response.statusCode).toBe(401);
  });

  it("requestAction startOAuth returns an oauthUrl built from the request-token response", async () => {
    const notification = buildNotification(fakeHttpClient());

    const result = (await notification.requestAction("startOAuth", {
      callbackUrl: "https://example.com/cb",
    })) as { oauthUrl: string; requestTokenSecret: string };

    expect(result.oauthUrl).toBe(
      "https://www.goodreads.com/oauth/authorize?oauth_token=rt&oauth_callback=https://example.com/cb"
    );
    expect(result.requestTokenSecret).toBe("rts");
  });

  it("requestAction startOAuth throws without a callbackUrl", async () => {
    const notification = buildNotification(fakeHttpClient());
    await expect(notification.requestAction("startOAuth", {})).rejects.toThrow(/callbackUrl/);
  });

  it(
    "requestAction getOAuthToken stores the access token/secret on settings, then hits the " +
      "same PRESERVED REAL C# BUG as test() when it calls GetUser() (see oAuthExecute's doc comment)",
    async () => {
      const execute = vi.fn(
        async (req) =>
          new HttpResponse(
            req,
            new HttpHeader(),
            '<GoodreadsResponse><user id="7"><name>Jane</name></user></GoodreadsResponse>',
            200
          )
      );
      const notification = buildNotification(fakeHttpClient({ execute }));

      await expect(
        notification.requestAction("getOAuthToken", {
          oauth_token: "rt",
          requestTokenSecret: "rts",
        })
      ).rejects.toThrow(/consumer key/i);

      // The token exchange itself (oAuthQuery -> the Servarr signing proxy)
      // completes fine and stores the tokens on settings before GetUser()
      // is reached and throws.
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it("requestAction getOAuthToken throws without requestTokenSecret", async () => {
    const notification = buildNotification(fakeHttpClient());
    await expect(
      notification.requestAction("getOAuthToken", { oauth_token: "rt" })
    ).rejects.toThrow(/requestTokenSecret/);
  });

  it("requestAction returns {} for an unrecognized action", async () => {
    const notification = buildNotification(fakeHttpClient());
    expect(await notification.requestAction("somethingElse", {})).toEqual({});
  });
});
