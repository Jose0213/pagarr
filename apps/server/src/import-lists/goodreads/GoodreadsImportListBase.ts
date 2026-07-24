/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/GoodreadsImportListBase.cs.
 *
 * LIVE-SERVICE STATUS: see `GoodreadsSettingsBase.ts`'s doc comment for the
 * full writeup -- this is the third, independent dead-Goodreads-Developer-API
 * touchpoint found across this project's history (metadata-source's read
 * client, notifications/goodreads's write-back, and this import-list-source
 * integration). Ported faithfully anyway per this project's standing
 * practice.
 *
 * Uses the shared `OAuthRequest` (`../../notifications/_shared/oauth1.ts`)
 * the same way `notifications/goodreads/GoodreadsNotificationBase.ts` does
 * -- see that shared module's doc comment for scope/fidelity notes on the
 * vendored OAuth 1.0a signing logic. Reused directly rather than duplicated
 * a third time (Twitter notifications being the first consumer).
 *
 * PRESERVED REAL C# BUG -- INDEPENDENTLY CONFIRMED A SECOND TIME (flagged
 * prominently here and in this worktree's final report, cross-referencing
 * `notifications/goodreads/GoodreadsNotificationBase.ts`'s identical
 * finding): `OAuthGet(HttpRequestBuilder)` below calls
 * `OAuthRequest.ForProtectedResource(builder.Method.ToString(), null, null,
 * Settings.AccessToken, Settings.AccessTokenSecret)` -- `null` for BOTH
 * `consumerKey` and `consumerSecret`, verbatim from the real C# source
 * (`GoodreadsImportListBase.cs` line ~127). `GoodreadsSettingsBase`
 * (ImportLists' own OAuth settings, `GoodreadsSettingsBase.ts` in this same
 * directory) has no `ConsumerKey`/`ConsumerSecret` fields either -- same
 * as the Notifications module's settings. `OAuthRequest.
 * GetAuthorizationHeader()` -> `ValidateProtectedResourceState()`
 * unconditionally throws `ArgumentException("You must specify a consumer
 * key")` for every `OAuthRequestType.ProtectedResource` request when
 * `ConsumerKey` is null/blank. This means `OAuthGet` -- and therefore every
 * real fetch this sub-module's providers make (`GoodreadsBookshelf.
 * getShelfList`/`getReviews`, `GoodreadsOwnedBooks.getOwned`, and this
 * base's own `getUser`, used by `testConnection`/`requestAction`) -- throws
 * unconditionally, every time, even with fully valid settings. Confirmed
 * independently (not copy-pasted) by reading this file's real C# source and
 * finding the exact same `null, null` argument pair `GoodreadsNotificationBase.
 * OAuthExecute` has. This is now confirmed dead/broken via TWO
 * independent code paths in the real upstream Readarr source (Notifications
 * AND ImportLists), a much stronger signal that `OAuthExecute`/`OAuthGet`'s
 * whole protected-resource-request code path has been dead/unreachable in
 * production Readarr for a long time (probably since whatever refactor
 * dropped `ConsumerKey`/`ConsumerSecret` from both settings classes),
 * independent of the December 2020 API-key-signup closure. Ported faithfully
 * via `oauth1.ts`'s `OAuthRequest.validateState()`/`getAuthorizationHeader()`,
 * which reproduces the same unconditional throw -- see this worktree's
 * `__tests__/goodreads/GoodreadsImportListBase.test.ts` for confirmation
 * this is intentional, not a porting error.
 */

import { XElement } from "../../indexers/xml/XElement.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { HttpResponse } from "../../http/HttpResponse.js";
import { BadRequestException } from "../../exceptions/BadRequestException.js";
import type { IConfigService } from "../../config/configService.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { OAuthRequest } from "../../notifications/_shared/oauth1.js";
import {
  ImportListBase,
  type IParsingService,
  type ImportListLogger,
  noopImportListLogger,
} from "../ImportListBase.js";
import { ImportListType } from "../ImportListType.js";
import type { IImportListStatusService } from "../ImportListStatusService.js";
import type { GoodreadsSettingsBase } from "./GoodreadsSettingsBase.js";

export interface AuthorizationHeader {
  authorization: string;
}

export interface GoodreadsUser {
  userId: string | null;
  userName: string | null;
}

/**
 * Ported from `GoodreadsImportListBase<TSettings> : ImportListBase<TSettings>`.
 * Abstract base for the OAuth-authenticated Goodreads import lists
 * (`GoodreadsBookshelf`, `GoodreadsOwnedBooks`) -- NOT `GoodreadsListImportList`/
 * `GoodreadsSeriesImportList`, which extend `ImportListBase` directly and
 * use `IProvideListInfo`/`IProvideSeriesInfo` instead (ID-based lookups, no
 * OAuth), matching the real C# class hierarchy.
 */
export abstract class GoodreadsImportListBase<
  TSettings extends GoodreadsSettingsBase,
> extends ImportListBase<TSettings> {
  protected readonly httpClient: IHttpClient;

  constructor(
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    httpClient: IHttpClient,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, logger);
    this.httpClient = httpClient;
  }

  override readonly listType = ImportListType.Goodreads;

  get accessToken(): string | null {
    return this.settings.accessToken;
  }

  /** Ported from `GoodreadsImportListBase.RequestBuilder()`. */
  protected requestBuilder(): HttpRequestBuilder {
    return new HttpRequestBuilder("https://www.goodreads.com/{route}")
      .addQueryParam("_nc", "1")
      .keepAlive();
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    const failure = await this.testConnectionInternal();
    if (failure !== null) {
      failures.push(failure);
    }
  }

  private async testConnectionInternal(): Promise<ValidationFailure | null> {
    try {
      await this.getUser(this.settings.userId);
      return null;
    } catch (ex) {
      if (ex instanceof HttpException) {
        this.logger.warn("Goodreads Authentication Error: %s", ex);
        return { propertyName: "", errorMessage: `Goodreads authentication error: ${ex.message}` };
      }

      this.logger.warn("Unable to connect to Goodreads: %s", ex);
      return {
        propertyName: "",
        errorMessage: "Unable to connect to import list, check the log for more details",
      };
    }
  }

  override requestAction(action: string, query: Record<string, string>): unknown {
    if (action === "startOAuth") {
      if (!query.callbackUrl || query.callbackUrl.trim() === "") {
        throw new BadRequestException("QueryParam callbackUrl invalid.");
      }

      const oAuthRequest = OAuthRequest.forRequestToken(null, null, query.callbackUrl);
      oAuthRequest.requestUrl = this.settings.oAuthRequestTokenUrl;

      return this.oAuthQuery(oAuthRequest).then((qscoll) => {
        const url = `${this.settings.oAuthUrl}?oauth_token=${qscoll.get("oauth_token")}&oauth_callback=${query.callbackUrl}`;

        return {
          oauthUrl: url,
          requestTokenSecret: qscoll.get("oauth_token_secret"),
        };
      });
    } else if (action === "getOAuthToken") {
      if (!query.oauth_token || query.oauth_token.trim() === "") {
        throw new BadRequestException("QueryParam oauth_token invalid.");
      }

      if (!query.requestTokenSecret || query.requestTokenSecret.trim() === "") {
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

      return this.oAuthQuery(oAuthRequest).then(async (qscoll) => {
        this.settings.accessToken = qscoll.get("oauth_token");
        this.settings.accessTokenSecret = qscoll.get("oauth_token_secret");

        const user = await this.getUser(this.settings.userId);

        return {
          accessToken: this.settings.accessToken,
          accessTokenSecret: this.settings.accessTokenSecret,
          requestTokenSecret: "",
          userId: user.userId,
          userName: user.userName,
        };
      });
    }

    return {};
  }

  /** Ported from `GoodreadsImportListBase.OAuthGet(HttpRequestBuilder)`. */
  protected async oAuthGet(builder: HttpRequestBuilder): Promise<HttpResponse> {
    const auth = OAuthRequest.forProtectedResource(
      builder.method,
      null,
      null,
      this.settings.accessToken,
      this.settings.accessTokenSecret
    );

    const request = builder.build();
    request.logResponseContent = true;

    // Sign against the URL without the query string, matching C#'s `request.Url.SetQuery(null).FullUri`.
    auth.requestUrl = request.url.setQuery("").fullUri;

    const params: Record<string, string> = {};
    for (const [key, value] of builder.queryParams) {
      params[key] = value;
    }
    auth.parameters = params;

    const header = auth.getAuthorizationHeader(auth.parameters ?? {});
    request.headers.set("Authorization", header);

    return this.httpClient.get(request);
  }

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
   * `GetAuthorizationHeader` -- matches
   * `GoodreadsNotificationBase.serializeOAuthRequest`'s identical
   * substitute for C#'s reflection-driven PascalCase JSON serialization
   * (this port's shared `OAuthRequest` only exposes the fields actually
   * populated -- see `notifications/_shared/oauth1.ts`'s doc comment on
   * scope).
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

  private async oAuthQuery(oAuthRequest: OAuthRequest): Promise<URLSearchParams> {
    const auth = await this.getAuthorizationHeader(oAuthRequest);
    const request = new HttpRequest(oAuthRequest.requestUrl);
    request.headers.set("Authorization", auth);

    const response = await this.httpClient.get(request);

    return new URLSearchParams(response.content);
  }

  /**
   * Ported from `GoodreadsImportListBase.GetUser(string id)`: `id === null`
   * hits `api/auth_user` (the authenticated user), otherwise
   * `user/show/{id}.xml` (a specific user by id).
   */
  protected async getUser(id: string | null): Promise<GoodreadsUser> {
    const builder = this.requestBuilder();

    if (id === null) {
      builder.setSegment("route", "api/auth_user");
    } else {
      builder.setSegment("route", `user/show/${id}.xml`);
    }

    const httpResponse = await this.oAuthGet(builder);

    let userId: string | null = null;
    let userName: string | null = null;

    const content = httpResponse.content;

    if (content && content.trim() !== "") {
      const doc = XElement.parse(content);
      const user = doc.element("user");

      if (user) {
        userId = user.attribute("id");
        userName = user.element("name")?.value ?? null;
      }
    }

    return { userId, userName };
  }
}
