/**
 * Ported from NzbDrone.Core/Notifications/Twitter/TwitterProxy.cs.
 *
 * LIVE-SERVICE STATUS -- FLAG FOR REVIEW: this proxy calls Twitter/X API
 * v1.1 endpoints (`https://api.twitter.com/1.1/statuses/update.json` and
 * `https://api.twitter.com/1.1/direct_messages/new.json`, plus the v1.1
 * OAuth 1.0a `oauth/request_token` / `oauth/authorize` / `oauth/access_token`
 * endpoints). X Corp (formerly Twitter) discontinued free-tier access to
 * these v1.1 endpoints in Feb 2023 and has since restructured the API into
 * paid tiers (Free/Basic/Pro/Enterprise) built around API v2, with v1.1
 * `statuses/update` and `direct_messages/new` requiring a paid Basic-tier-
 * or-above subscription (and `direct_messages/new` specifically has been
 * superseded by v2 Direct Message endpoints in the paid tiers). The
 * *integration point itself is real* (Twitter/X exists, has a real API,
 * and OAuth 1.0a user-context auth as coded here is still a valid mechanism
 * for the endpoints that remain), but the specific free/no-payment access
 * this Readarr-era code assumes no longer exists -- ported faithfully
 * per this task's brief, not silently upgraded to v2 or gated as dead.
 */

import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import type { HttpResponse } from "../../http/HttpResponse.js";
import { OAuthRequest } from "../_shared/oauth1.js";
import type { TwitterSettings } from "./TwitterSettings.js";

/**
 * Ported from `NzbDrone.Common.Extensions.StringExtensions.EncodeRFC3986`.
 * `Uri.EscapeDataString` percent-encoding, then upper-cases any already-hex
 * escape triplets, then additionally escapes `( ) $ ! * '` and finally
 * un-escapes `%7E` back to a literal `~` (an RFC 3986 unreserved character
 * .NET's `Uri.EscapeDataString` over-escapes by default).
 */
export function encodeRFC3986(value: string): string {
  if (!value) {
    return "";
  }

  let encoded = encodeURIComponent(value).replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());

  encoded = encoded
    .split("(")
    .join("%28")
    .split(")")
    .join("%29")
    .split("$")
    .join("%24")
    .split("!")
    .join("%21")
    .split("*")
    .join("%2A")
    .split("'")
    .join("%27")
    .split("%7E")
    .join("~");

  return encoded;
}

export interface ITwitterProxy {
  getOAuthToken(
    consumerKey: string,
    consumerSecret: string,
    oauthToken: string,
    oauthVerifier: string
  ): Promise<URLSearchParams>;
  getOAuthRedirect(
    consumerKey: string,
    consumerSecret: string,
    callbackUrl: string
  ): Promise<string>;
  updateStatus(message: string, settings: TwitterSettings): Promise<void>;
  directMessage(message: string, settings: TwitterSettings): Promise<void>;
}

export class TwitterProxy implements ITwitterProxy {
  constructor(private readonly httpClient: IHttpClient) {}

  async getOAuthRedirect(
    consumerKey: string,
    consumerSecret: string,
    callbackUrl: string
  ): Promise<string> {
    const oAuthRequest = OAuthRequest.forRequestToken(consumerKey, consumerSecret, callbackUrl);
    oAuthRequest.requestUrl = "https://api.twitter.com/oauth/request_token";

    const response = await this.executeRequest(this.getRequest(oAuthRequest, {}));
    const qscoll = new URLSearchParams(response.content);

    return `https://api.twitter.com/oauth/authorize?oauth_token=${qscoll.get("oauth_token")}`;
  }

  async getOAuthToken(
    consumerKey: string,
    consumerSecret: string,
    oauthToken: string,
    oauthVerifier: string
  ): Promise<URLSearchParams> {
    const oAuthRequest = OAuthRequest.forAccessToken(
      consumerKey,
      consumerSecret,
      oauthToken,
      "",
      oauthVerifier
    );
    oAuthRequest.requestUrl = "https://api.twitter.com/oauth/access_token";

    const response = await this.executeRequest(this.getRequest(oAuthRequest, {}));
    return new URLSearchParams(response.content);
  }

  async updateStatus(message: string, settings: TwitterSettings): Promise<void> {
    const oAuthRequest = OAuthRequest.forProtectedResource(
      "POST",
      settings.consumerKey,
      settings.consumerSecret,
      settings.accessToken,
      settings.accessTokenSecret
    );

    oAuthRequest.requestUrl = "https://api.twitter.com/1.1/statuses/update.json";

    const customParams = { status: encodeRFC3986(message) };

    const request = this.getRequest(oAuthRequest, customParams);
    request.headers.contentType = "application/x-www-form-urlencoded";
    request.setContent(this.getCustomParametersString(customParams));

    await this.executeRequest(request);
  }

  async directMessage(message: string, settings: TwitterSettings): Promise<void> {
    const oAuthRequest = OAuthRequest.forProtectedResource(
      "POST",
      settings.consumerKey,
      settings.consumerSecret,
      settings.accessToken,
      settings.accessTokenSecret
    );

    oAuthRequest.requestUrl = "https://api.twitter.com/1.1/direct_messages/new.json";

    const customParams = {
      text: encodeRFC3986(message),
      screenname: encodeRFC3986(settings.mention ?? ""),
    };

    const request = this.getRequest(oAuthRequest, customParams);
    request.headers.contentType = "application/x-www-form-urlencoded";
    request.setContent(this.getCustomParametersString(customParams));

    await this.executeRequest(request);
  }

  private getCustomParametersString(customParams: Record<string, string>): string {
    return Object.entries(customParams)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
  }

  private getRequest(
    oAuthRequest: OAuthRequest,
    customParams: Record<string, string>
  ): HttpRequest {
    const auth = oAuthRequest.getAuthorizationHeader(customParams);
    const request = new HttpRequestBuilder(oAuthRequest.requestUrl).build();

    request.headers.set("Authorization", auth);
    request.method = oAuthRequest.method === "POST" ? "POST" : "GET";

    return request;
  }

  private executeRequest(request: HttpRequest): Promise<HttpResponse> {
    return this.httpClient.execute(request);
  }
}
