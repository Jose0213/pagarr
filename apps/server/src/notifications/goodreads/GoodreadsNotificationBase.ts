/**
 * Ported from NzbDrone.Core/Notifications/Goodreads/GoodreadsNotificationBase.cs.
 *
 * LIVE-SERVICE STATUS: see `GoodreadsSettingsBase.ts`'s doc comment for the
 * full writeup -- every endpoint this file calls
 * (`www.goodreads.com/api/auth_user`, `.../oauth/*`) is part of the
 * Goodreads Developer API that stopped accepting new API-key signups in
 * December 2020. Ported faithfully anyway per this project's standing
 * practice.
 *
 * Uses the shared `OAuthRequest` (`../_shared/oauth1.ts`) the same way
 * `twitter/TwitterProxy.ts` does -- see that shared module's doc comment
 * for scope/fidelity notes on the vendored OAuth 1.0a signing logic.
 */

import { XElement } from "../../indexers/xml/XElement.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { HttpResponse } from "../../http/HttpResponse.js";
import { BadRequestException } from "../../exceptions/BadRequestException.js";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import { OAuthRequest } from "../_shared/oauth1.js";
import { NotificationBase } from "../NotificationBase.js";
import type { AuthorizationHeader } from "./resources.js";
import type { GoodreadsSettingsBase } from "./GoodreadsSettingsBase.js";

/** Minimal logger surface, matching this port's convention elsewhere. */
export interface GoodreadsLogger {
  trace(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

const noopLogger: GoodreadsLogger = { trace: () => {}, warn: () => {} };

export interface GoodreadsUser {
  userId: string | null;
  userName: string | null;
}

/**
 * Ported from `GoodreadsNotificationBase<TSettings> : NotificationBase<TSettings>`.
 * Abstract base for the two concrete Goodreads notifiers
 * (`GoodreadsBookshelf`, `GoodreadsOwnedBooks`).
 */
export abstract class GoodreadsNotificationBase<
  TSettings extends GoodreadsSettingsBase = GoodreadsSettingsBase,
> extends NotificationBase<TSettings> {
  override readonly link = "https://goodreads.com/";

  protected readonly httpClient: IHttpClient;
  protected readonly logger: GoodreadsLogger;

  protected constructor(httpClient: IHttpClient, logger: GoodreadsLogger = noopLogger) {
    super();
    this.httpClient = httpClient;
    this.logger = logger;
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.testConnection();
    if (failure !== null) {
      failures.push(failure);
    }

    return { isValid: failures.length === 0, hasWarnings: false, errors: failures };
  }

  override async requestAction(action: string, query: Record<string, string>): Promise<unknown> {
    if (action === "startOAuth") {
      if (!query.callbackUrl) {
        throw new BadRequestException("QueryParam callbackUrl invalid.");
      }

      const oAuthRequest = OAuthRequest.forRequestToken(null, null, query.callbackUrl);
      oAuthRequest.requestUrl = this.settings.oAuthRequestTokenUrl;
      const qscoll = await this.oAuthQuery(oAuthRequest);

      const url = `${this.settings.oAuthUrl}?oauth_token=${qscoll.get("oauth_token")}&oauth_callback=${query.callbackUrl}`;

      return {
        oauthUrl: url,
        requestTokenSecret: qscoll.get("oauth_token_secret"),
      };
    } else if (action === "getOAuthToken") {
      if (!query.oauth_token) {
        throw new BadRequestException("QueryParam oauth_token invalid.");
      }

      if (!query.requestTokenSecret) {
        throw new BadRequestException("Missing requestTokenSecret.");
      }

      const oAuthRequest = OAuthRequest.forAccessToken(
        null,
        null,
        query.oauth_token,
        query.requestTokenSecret,
        ""
      );
      oAuthRequest.requestUrl = this.settings.oAuthAccessTokenUrl;
      const qscoll = await this.oAuthQuery(oAuthRequest);

      this.settings.accessToken = qscoll.get("oauth_token");
      this.settings.accessTokenSecret = qscoll.get("oauth_token_secret");

      const user = await this.getUser();

      return {
        accessToken: this.settings.accessToken,
        accessTokenSecret: this.settings.accessTokenSecret,
        requestTokenSecret: "",
        userId: user.userId,
        userName: user.userName,
      };
    }

    return {};
  }

  /** Ported from GoodreadsNotificationBase.RequestBuilder(). */
  protected requestBuilder(): HttpRequestBuilder {
    return new HttpRequestBuilder("https://www.goodreads.com/{route}").keepAlive();
  }

  /**
   * Ported from GoodreadsNotificationBase.OAuthExecute(HttpRequestBuilder).
   * Signs the request with the stored access token/secret via OAuth 1.0a
   * "protected resource" auth, matching the C#'s GET-uses-query-params /
   * POST-uses-form-params branch for which parameters get included in the
   * signature base.
   *
   * PRESERVED REAL C# BUG (severe -- flagged prominently in this worktree's
   * final report): `OAuthRequest.ForProtectedResource(builder.Method.ToString(),
   * null, null, Settings.AccessToken, Settings.AccessTokenSecret)` passes
   * `null` for BOTH `consumerKey` and `consumerSecret` -- verbatim from the
   * real C# source, line 108 of GoodreadsNotificationBase.cs.
   * `GoodreadsSettingsBase` has no `ConsumerKey`/`ConsumerSecret` fields at
   * all (confirmed: zero occurrences of either name anywhere in
   * `Notifications/Goodreads/*.cs`), so there is no value this could ever
   * be populated with. But `OAuthRequest.GetAuthorizationHeader()` ->
   * `ValidateProtectedResourceState()` (OAuthRequest.cs line 408) THROWS
   * `ArgumentException("You must specify a consumer key")` whenever
   * `ConsumerKey` is null/blank, unconditionally, for every
   * `OAuthRequestType.ProtectedResource` request. This means, as literally
   * written, `OAuthExecute` -- and therefore every single Goodreads
   * notification action that calls it (GetUser, GetShelfList, SearchShelf,
   * RemoveBookFromShelves, AddToShelves, AddOwnedBook) -- throws
   * unconditionally in the real C#, every time, even with fully valid
   * settings. This reads as a genuine defect in the real upstream source
   * (or evidence the whole `OAuthExecute` path has been dead/never-
   * exercised code since some prior refactor), not a porting error. Ported
   * faithfully via `oauth1.ts`'s `OAuthRequest.validateState()`, which
   * reproduces the same unconditional throw for `ProtectedResource` type
   * when `consumerKey`/`consumerSecret` are null -- see that file and this
   * worktree's tests (`__tests__/goodreads/GoodreadsNotificationBase.test.ts`)
   * for confirmation this is intentional, not a bug in the port.
   */
  protected async oAuthExecute(builder: HttpRequestBuilder): Promise<HttpResponse> {
    const auth = OAuthRequest.forProtectedResource(
      builder.method,
      null,
      null,
      this.settings.accessToken,
      this.settings.accessTokenSecret
    );

    const request = builder.build();
    request.logResponseContent = true;

    // Sign against the URL without the query string, matching C#'s
    // `request.Url.SetQuery(null).FullUri`.
    auth.requestUrl = request.url.setQuery("").fullUri;

    if (builder.method === "GET") {
      const params: Record<string, string> = {};
      for (const [key, value] of builder.queryParams) {
        params[key] = value;
      }
      auth.parameters = params;
    } else if (builder.method === "POST") {
      const params: Record<string, string> = {};
      for (const field of builder.formData) {
        if (field.name !== undefined) {
          params[field.name] = Buffer.from(field.contentData).toString("utf8");
        }
      }
      auth.parameters = params;
    }

    const header = auth.getAuthorizationHeader(auth.parameters ?? {});
    request.headers.set("Authorization", header);

    return this.httpClient.execute(request);
  }

  /** Ported from GoodreadsNotificationBase.TestConnection(). */
  private async testConnection(): Promise<ValidationFailure | null> {
    try {
      await this.getUser();
      return null;
    } catch (ex) {
      if (ex instanceof HttpException) {
        this.logger.warn("Goodreads Authentication Error", ex);
        return { propertyName: "", errorMessage: `Goodreads authentication error: ${ex.message}` };
      }

      this.logger.warn("Unable to connect to Goodreads", ex);
      return {
        propertyName: "",
        errorMessage: "Unable to connect to Goodreads, check the log for more details",
      };
    }
  }

  /** Ported from GoodreadsNotificationBase.GetUser(). */
  private async getUser(): Promise<GoodreadsUser> {
    const builder = this.requestBuilder().setSegment("route", "api/auth_user");

    const httpResponse = await this.oAuthExecute(builder);

    let userId: string | null = null;
    let userName: string | null = null;

    const content = httpResponse.content;

    if (content && content.trim() !== "") {
      // Ported from `XDocument.Parse(content).XPathSelectElement("GoodreadsResponse/user")`:
      // XElement.parse returns the root element itself (<GoodreadsResponse>),
      // so `.element("user")` walks straight to the same child the XPath targets.
      const doc = XElement.parse(content);
      const user = doc.element("user");

      if (user) {
        userId = user.attribute("id");
        userName = user.element("name")?.value ?? null;
      }
    }

    return { userId, userName };
  }

  /** Ported from GoodreadsNotificationBase.GetAuthorizationHeader(OAuthRequest). */
  private async getAuthorizationHeader(oAuthRequest: OAuthRequest): Promise<string> {
    const request = new HttpRequest(this.settings.signingUrl);
    request.method = "POST";
    request.headers.set("Content-Type", "application/json");

    const payload = JSON.stringify(this.serializeOAuthRequest(oAuthRequest));
    this.logger.trace(payload);
    request.setContent(payload);

    const response = await this.httpClient.postTyped<AuthorizationHeader>(request);

    return response.resource.authorization;
  }

  /**
   * Ported from the implicit `oAuthRequest.ToJson()` call in
   * GetAuthorizationHeader -- C#'s JSON serializer would PascalCase-emit
   * every public property on `OAuthRequest` (ConsumerKey, Token, Parameters,
   * etc). This port's `OAuthRequest` (`../_shared/oauth1.ts`) only exposes
   * the fields Twitter/Goodreads actually populate (see that module's doc
   * comment on scope) -- this serializes the same field set the Servarr
   * signing proxy expects, using its PascalCase JSON contract.
   */
  private serializeOAuthRequest(oAuthRequest: OAuthRequest): Record<string, unknown> {
    return {
      Method: oAuthRequest.method,
      ConsumerKey: oAuthRequest.consumerKey,
      ConsumerSecret: oAuthRequest.consumerSecret,
      Token: oAuthRequest.token,
      TokenSecret: oAuthRequest.tokenSecret,
      Verifier: oAuthRequest.verifier,
      CallbackUrl: oAuthRequest.callbackUrl,
      Version: oAuthRequest.version,
      RequestUrl: oAuthRequest.requestUrl,
      Parameters: oAuthRequest.parameters,
    };
  }

  /** Ported from GoodreadsNotificationBase.OAuthQuery(OAuthRequest). */
  private async oAuthQuery(oAuthRequest: OAuthRequest): Promise<URLSearchParams> {
    const auth = await this.getAuthorizationHeader(oAuthRequest);
    const request = new HttpRequest(oAuthRequest.requestUrl);
    request.headers.set("Authorization", auth);

    const response = await this.httpClient.get(request);

    return new URLSearchParams(response.content);
  }
}
