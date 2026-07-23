/**
 * Ported from `NzbDrone.Common/OAuth/{OAuthRequest,OAuthTools,WebParameter,
 * WebParameterCollection,OAuthSignatureMethod,OAuthSignatureTreatment,
 * OAuthRequestType}.cs` -- a vendored OAuth 1.0a client (the file header
 * credits the DevDefined.OAuth project; LICENSE file sits alongside the C#
 * sources). Both Twitter (`TwitterProxy.cs`) and Goodreads
 * (`GoodreadsNotificationBase.cs`) build requests through this exact same
 * `OAuthRequest` API, so it's ported once here as a shared module rather
 * than duplicated per-notifier.
 *
 * Scope: only the parts actually exercised by Twitter/Goodreads are ported:
 *  - `OAuthSignatureMethod.HmacSha1` (the only method NzbDrone.Common's
 *    `OAuthTools.GetSignature` implements -- every other enum value throws
 *    `NotImplementedException` in the original, so there is nothing else to
 *    port faithfully).
 *  - `OAuthRequestType.RequestToken` / `AccessToken` / `ProtectedResource`
 *    (Twitter and Goodreads never construct `ClientAuthentication`).
 *  - `GetAuthorizationHeader` (both notifiers use the header form, never
 *    `GetAuthorizationQuery`).
 *
 * `UrlEncodeStrict`'s per-character `.Replace` loop and `UrlEncodeRelaxed`'s
 * `Uri.EscapeDataString` + manual paren-escaping are both reproduced
 * byte-for-byte in `urlEncodeStrict`/`urlEncodeRelaxed` below, INCLUDING the
 * original's `%%` -> `%25%` quirk in `UrlEncodeStrict` (a real bug/oddity in
 * the vendored library: it's meant to re-escape literal `%` characters but
 * the replacement leaves a bare trailing `%` from the second `%` in `%%`
 * unescaped). Preserved faithfully per this port's "don't fix upstream bugs
 * silently" rule.
 */

import { createHmac, randomInt } from "node:crypto";

export type OAuthSignatureMethod = "HmacSha1";
export type OAuthSignatureTreatment = "Escaped" | "Unescaped";
export type OAuthRequestType = "RequestToken" | "AccessToken" | "ProtectedResource";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGIT = "1234567890";
const UNRESERVED = UPPER + LOWER + DIGIT + "-._~";

/** Ported from OAuthTools.GetNonce(): 16-char lowercase-alphanumeric random string. */
export function getNonce(): string {
  const chars = LOWER + DIGIT;
  let nonce = "";
  for (let i = 0; i < 16; i++) {
    nonce += chars[randomInt(0, chars.length)];
  }
  return nonce;
}

/** Ported from OAuthTools.GetTimestamp(): Unix seconds since epoch, as a string. */
export function getTimestamp(date: Date = new Date()): string {
  return Math.floor(date.getTime() / 1000).toString();
}

/**
 * Ported from OAuthTools.PercentEncode(string) -- percent-encodes every
 * UTF-8 byte of `s`, upper-casing hex digits, with the original's odd
 * zero-padding for byte values 8, 9, 10 (`\b \t \n`) and 13 (`\r`) (`b > 7
 * && b < 11` covers 8/9/10; `b == 13` covers 13 -- both get a literal `%0`
 * prefix instead of `%` for a single hex digit, matching `"%0{0:X}"` vs
 * `"%{0:X}"` in the C#).
 */
function percentEncodeBytes(s: string): string {
  const bytes = Buffer.from(s, "utf8");
  let out = "";
  for (const b of bytes) {
    const hex = b.toString(16).toUpperCase();
    if ((b > 7 && b < 11) || b === 13) {
      out += `%0${hex}`;
    } else {
      out += `%${hex}`;
    }
  }
  return out;
}

/**
 * Ported from OAuthTools.UrlEncodeRelaxed: `Uri.EscapeDataString` (RFC 3986
 * percent-encoding, leaving unreserved chars untouched) then additionally
 * escapes literal `(` and `)` (LinkedIn compatibility note preserved from
 * the original comment).
 */
export function urlEncodeRelaxed(value: string): string {
  let escaped = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  escaped = escaped
    .split("(")
    .join(percentEncodeBytes("("))
    .split(")")
    .join(percentEncodeBytes(")"));
  return escaped;
}

/**
 * Ported from OAuthTools.UrlEncodeStrict: replaces every character not in
 * the RFC-3986 unreserved set (and not already `%`) with its percent-encoded
 * form, then applies the `%%` -> `%25%` fixup verbatim (see this file's
 * header doc comment -- a faithfully-preserved upstream oddity, not fixed
 * here).
 */
export function urlEncodeStrict(value: string): string {
  let result = value;
  for (const c of value) {
    if (!UNRESERVED.includes(c) && c !== "%") {
      result = result.split(c).join(percentEncodeBytes(c));
    }
  }
  return result.split("%%").join("%25%");
}

export interface WebParameter {
  name: string;
  value: string;
}

/**
 * Ported from OAuthTools.SortParametersExcludingSignature: drops any
 * `oauth_signature` param, strict-URL-encodes every remaining value, then
 * sorts by name (and by value when names tie).
 */
function sortParametersExcludingSignature(parameters: WebParameter[]): WebParameter[] {
  const copy = parameters
    .filter((p) => p.name.toLowerCase() !== "oauth_signature")
    .map((p) => ({ name: p.name, value: urlEncodeStrict(p.value) }));

  copy.sort((a, b) => {
    if (a.name === b.name) {
      return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  return copy;
}

/** Ported from OAuthTools.NormalizeRequestParameters. */
function normalizeRequestParameters(parameters: WebParameter[]): string {
  const sorted = sortParametersExcludingSignature(parameters);
  return sorted.map((p) => `${p.name}=${p.value}`).join("&");
}

/**
 * Ported from OAuthTools.ConstructRequestUrl: scheme://host[:port]/path,
 * dropping the default port for http:80 / https:443, no query string.
 */
function constructRequestUrl(url: string): string {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(":", "");
  const basicPort = scheme === "http" && (parsed.port === "" || parsed.port === "80");
  const securePort = scheme === "https" && (parsed.port === "" || parsed.port === "443");
  const portSuffix = !basicPort && !securePort && parsed.port !== "" ? `:${parsed.port}` : "";
  const path = parsed.pathname === "" ? "/" : parsed.pathname;

  return `${scheme}://${parsed.hostname}${portSuffix}${path}`;
}

/** Ported from OAuthTools.ConcatenateRequestElements (the OAuth 1.0a "signature base string"). */
function concatenateRequestElements(
  method: string,
  url: string,
  parameters: WebParameter[]
): string {
  const requestMethod = `${method.toUpperCase()}&`;
  const requestUrl = `${urlEncodeRelaxed(constructRequestUrl(url))}&`;
  const requestParameters = urlEncodeRelaxed(normalizeRequestParameters(parameters));

  return requestMethod + requestUrl + requestParameters;
}

/**
 * Ported from OAuthTools.GetSignature (HMAC-SHA1 branch only -- see this
 * file's header doc comment on scope).
 */
function getSignature(
  signatureBase: string,
  consumerSecret: string,
  tokenSecret: string | null,
  signatureTreatment: OAuthSignatureTreatment
): string {
  const encodedConsumerSecret = urlEncodeRelaxed(consumerSecret);
  const encodedTokenSecret = urlEncodeRelaxed(tokenSecret ?? "");
  const key = `${encodedConsumerSecret}&${encodedTokenSecret}`;

  const signature = createHmac("sha1", key).update(signatureBase, "utf8").digest("base64");

  return signatureTreatment === "Escaped" ? urlEncodeRelaxed(signature) : signature;
}

/**
 * Ported from NzbDrone.Common/OAuth/OAuthRequest.cs. Only the fields and
 * factory/header methods Twitter/Goodreads actually use are ported (see
 * this file's header doc comment on scope).
 */
export class OAuthRequest {
  signatureMethod: OAuthSignatureMethod = "HmacSha1";
  signatureTreatment: OAuthSignatureTreatment = "Escaped";
  type: OAuthRequestType;

  method = "GET";
  consumerKey: string | null;
  consumerSecret: string | null;
  token: string | null = null;
  tokenSecret: string | null = null;
  verifier: string | null = null;
  callbackUrl: string | null = null;
  version: string | null = null;

  requestUrl = "";
  parameters: Record<string, string> | null = null;

  private constructor(
    type: OAuthRequestType,
    consumerKey: string | null,
    consumerSecret: string | null
  ) {
    this.type = type;
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
  }

  /** Ported from `OAuthRequest.ForRequestToken(consumerKey, consumerSecret, callbackUrl = null)`. */
  static forRequestToken(
    consumerKey: string | null,
    consumerSecret: string | null,
    callbackUrl: string | null = null
  ): OAuthRequest {
    const request = new OAuthRequest("RequestToken", consumerKey, consumerSecret);
    request.callbackUrl = callbackUrl;
    return request;
  }

  /** Ported from `OAuthRequest.ForAccessToken(consumerKey, consumerSecret, requestToken, requestTokenSecret, verifier = null)`. */
  static forAccessToken(
    consumerKey: string | null,
    consumerSecret: string | null,
    requestToken: string | null,
    requestTokenSecret: string | null,
    verifier: string | null = null
  ): OAuthRequest {
    const request = new OAuthRequest("AccessToken", consumerKey, consumerSecret);
    request.token = requestToken;
    request.tokenSecret = requestTokenSecret;
    request.verifier = verifier;
    return request;
  }

  /** Ported from `OAuthRequest.ForProtectedResource(method, consumerKey, consumerSecret, accessToken, accessTokenSecret)`. */
  static forProtectedResource(
    method: string | null,
    consumerKey: string | null,
    consumerSecret: string | null,
    accessToken: string | null,
    accessTokenSecret: string | null
  ): OAuthRequest {
    const request = new OAuthRequest("ProtectedResource", consumerKey, consumerSecret);
    request.method = method ?? "GET";
    request.token = accessToken;
    request.tokenSecret = accessTokenSecret;
    return request;
  }

  /**
   * Ported from `OAuthRequest.GetAuthorizationHeader(IDictionary<string,
   * string> parameters)` -> `GetSignatureAuthorizationHeader` (all three
   * ported request types route through the same signature-header path; the
   * `ClientAuthentication`/XAuth branch is out of scope, see file header).
   */
  getAuthorizationHeader(customParameters: Record<string, string> = {}): string {
    this.validateState();

    const parameters: WebParameter[] = Object.entries(customParameters).map(([name, value]) => ({
      name,
      value,
    }));

    const timestamp = getTimestamp();
    const nonce = getNonce();

    this.addAuthParameters(parameters, timestamp, nonce);

    const signatureBase = concatenateRequestElements(this.method, this.requestUrl, parameters);
    const signature = getSignature(
      signatureBase,
      this.consumerSecret ?? "",
      this.tokenSecret,
      this.signatureTreatment
    );

    parameters.push({ name: "oauth_signature", value: signature });

    return this.writeAuthorizationHeader(parameters);
  }

  private addAuthParameters(parameters: WebParameter[], timestamp: string, nonce: string): void {
    parameters.push({ name: "oauth_consumer_key", value: this.consumerKey ?? "" });
    parameters.push({ name: "oauth_nonce", value: nonce });
    parameters.push({ name: "oauth_signature_method", value: "HMAC-SHA1" });
    parameters.push({ name: "oauth_timestamp", value: timestamp });
    parameters.push({ name: "oauth_version", value: this.version ?? "1.0" });

    if (isNotBlank(this.token)) {
      parameters.push({ name: "oauth_token", value: this.token });
    }

    if (isNotBlank(this.callbackUrl)) {
      parameters.push({ name: "oauth_callback", value: this.callbackUrl });
    }

    if (isNotBlank(this.verifier)) {
      parameters.push({ name: "oauth_verifier", value: this.verifier });
    }
  }

  /** Ported from `OAuthRequest.WriteAuthorizationHeader` (no `Realm` support -- Twitter/Goodreads never set one). */
  private writeAuthorizationHeader(parameters: WebParameter[]): string {
    const sorted = [...parameters].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const parts = sorted
      .filter(
        (p) =>
          isNotBlank(p.name) &&
          isNotBlank(p.value) &&
          (p.name.startsWith("oauth_") || p.name.startsWith("x_auth_"))
      )
      .map((p) => `${p.name}="${p.value}"`);

    return "OAuth " + parts.join(",");
  }

  private validateState(): void {
    if (this.type === "RequestToken" || this.type === "AccessToken") {
      if (!isNotBlank(this.method)) {
        throw new Error("You must specify an HTTP method");
      }
      if (!isNotBlank(this.requestUrl)) {
        throw new Error("You must specify a request/access token URL");
      }
      if (!isNotBlank(this.consumerKey)) {
        throw new Error("You must specify a consumer key");
      }
      if (!isNotBlank(this.consumerSecret)) {
        throw new Error("You must specify a consumer secret");
      }
      if (this.type === "AccessToken" && !isNotBlank(this.token)) {
        throw new Error("You must specify a token");
      }
    } else {
      // ProtectedResource
      if (!isNotBlank(this.method)) {
        throw new Error("You must specify an HTTP method");
      }
      if (!isNotBlank(this.consumerKey)) {
        throw new Error("You must specify a consumer key");
      }
      if (!isNotBlank(this.consumerSecret)) {
        throw new Error("You must specify a consumer secret");
      }
    }
  }
}

function isNotBlank(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}
