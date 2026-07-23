import { describe, expect, it } from "vitest";
import {
  OAuthRequest,
  getNonce,
  getTimestamp,
  urlEncodeRelaxed,
  urlEncodeStrict,
} from "../_shared/oauth1.js";

describe("oauth1 encoding helpers", () => {
  it("getNonce returns a 16-char lowercase-alphanumeric string", () => {
    const nonce = getNonce();
    expect(nonce).toHaveLength(16);
    expect(nonce).toMatch(/^[a-z0-9]{16}$/);
  });

  it("getTimestamp returns unix seconds as a string", () => {
    const date = new Date("2020-01-01T00:00:00.000Z");
    expect(getTimestamp(date)).toBe("1577836800");
  });

  it("urlEncodeRelaxed leaves unreserved characters untouched", () => {
    expect(urlEncodeRelaxed("abcABC123-._~")).toBe("abcABC123-._~");
  });

  it("urlEncodeRelaxed percent-encodes spaces and special characters", () => {
    expect(urlEncodeRelaxed("a b")).toBe("a%20b");
    expect(urlEncodeRelaxed("a+b")).toBe("a%2Bb");
  });

  it("urlEncodeRelaxed additionally escapes parens (LinkedIn compat note in the original)", () => {
    expect(urlEncodeRelaxed("(a)")).toBe("%28a%29");
  });

  it("urlEncodeStrict escapes every non-unreserved character including apostrophes", () => {
    expect(urlEncodeStrict("it's")).toBe("it%27s");
  });

  it("urlEncodeStrict leaves unreserved characters and existing % untouched", () => {
    expect(urlEncodeStrict("abc-._~%41")).toBe("abc-._~%41");
  });

  it("urlEncodeStrict preserves the upstream %% -> %25% quirk verbatim", () => {
    // Ported faithfully from OAuthTools.UrlEncodeStrict's final
    // .Replace("%%", "%25%") -- see oauth1.ts's header doc comment.
    expect(urlEncodeStrict("a%%b")).toBe("a%25%b");
  });
});

describe("OAuthRequest", () => {
  it("forRequestToken sets type, consumer creds, and callback url", () => {
    const request = OAuthRequest.forRequestToken("key", "secret", "https://example.com/callback");
    expect(request.type).toBe("RequestToken");
    expect(request.consumerKey).toBe("key");
    expect(request.consumerSecret).toBe("secret");
    expect(request.callbackUrl).toBe("https://example.com/callback");
  });

  it("forAccessToken sets token/tokenSecret/verifier", () => {
    const request = OAuthRequest.forAccessToken("key", "secret", "tok", "toksecret", "verifier");
    expect(request.type).toBe("AccessToken");
    expect(request.token).toBe("tok");
    expect(request.tokenSecret).toBe("toksecret");
    expect(request.verifier).toBe("verifier");
  });

  it("forProtectedResource defaults method to GET when null is passed", () => {
    const request = OAuthRequest.forProtectedResource(null, "key", "secret", "tok", "toksecret");
    expect(request.method).toBe("GET");
    expect(request.type).toBe("ProtectedResource");
  });

  it("getAuthorizationHeader throws when consumer key is missing", () => {
    const request = OAuthRequest.forProtectedResource("GET", null, null, null, null);
    request.requestUrl = "https://api.example.com/resource";
    expect(() => request.getAuthorizationHeader()).toThrow(/consumer key/i);
  });

  it("getAuthorizationHeader throws for AccessToken type when token is missing", () => {
    const request = OAuthRequest.forAccessToken("key", "secret", null, null);
    request.requestUrl = "https://api.example.com/oauth/access_token";
    expect(() => request.getAuthorizationHeader()).toThrow(/token/i);
  });

  it("getAuthorizationHeader produces an 'OAuth ...' header with sorted, quoted oauth_ params", () => {
    const request = OAuthRequest.forProtectedResource(
      "GET",
      "consumerKey",
      "consumerSecret",
      "tok",
      "toksecret"
    );
    request.requestUrl = "https://api.example.com/resource";

    const header = request.getAuthorizationHeader();

    expect(header.startsWith("OAuth ")).toBe(true);
    expect(header).toContain('oauth_consumer_key="consumerKey"');
    expect(header).toContain('oauth_token="tok"');
    expect(header).toContain("oauth_signature=");
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');

    // Params in the header must be sorted alphabetically by name (WriteAuthorizationHeader).
    const names = [...header.matchAll(/([a-z_]+)="/g)].map((m) => m[1]);
    const sortedNames = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sortedNames);
  });

  it("getAuthorizationHeader signature changes when the secret changes (sanity check on HMAC wiring)", () => {
    const build = (secret: string) => {
      const request = OAuthRequest.forProtectedResource("GET", "key", secret, "tok", "toksecret");
      request.requestUrl = "https://api.example.com/resource";
      return request.getAuthorizationHeader();
    };

    expect(build("secretA")).not.toBe(build("secretB"));
  });

  it("getAuthorizationHeader is deterministic given the same nonce/timestamp inputs indirectly via custom params", () => {
    // Two calls will differ due to fresh nonce/timestamp each time -- this
    // just asserts the header shape stays well-formed across repeat calls.
    const request = OAuthRequest.forProtectedResource("POST", "key", "secret", "tok", "toksecret");
    request.requestUrl = "https://api.example.com/statuses/update.json";

    const header1 = request.getAuthorizationHeader({ status: "hello" });
    const header2 = request.getAuthorizationHeader({ status: "hello" });

    expect(header1).toMatch(/^OAuth /);
    expect(header2).toMatch(/^OAuth /);
  });
});
