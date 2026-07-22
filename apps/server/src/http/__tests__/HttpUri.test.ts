import { describe, expect, it } from "vitest";
import { HttpUri } from "../HttpUri.js";

describe("HttpUri", () => {
  it("parses scheme/host/port/path/query/fragment", () => {
    const uri = new HttpUri("https://example.com:8080/api/v1/books?limit=10#top");

    expect(uri.scheme).toBe("https");
    expect(uri.host).toBe("example.com");
    expect(uri.port).toBe(8080);
    expect(uri.path).toBe("/api/v1/books");
    expect(uri.query).toBe("limit=10");
    expect(uri.fragment).toBe("top");
  });

  it("round-trips via fullUri/toString", () => {
    const raw = "https://indexer.example.com/torznab/api?t=search&q=foo";
    expect(new HttpUri(raw).fullUri).toBe(raw);
    expect(new HttpUri(raw).toString()).toBe(raw);
  });

  it("builds from parts via the 6-arg constructor", () => {
    const uri = new HttpUri("https", "example.com", 443, "/foo", "a=b", null);
    expect(uri.toString()).toBe("https://example.com:443/foo?a=b");
  });

  it("combinePath joins base and relative paths with a single slash", () => {
    const uri = new HttpUri("https://example.com/api/");
    const combined = uri.combinePath("v1/books");
    expect(combined.path).toBe("/api/v1/books");
  });

  it("addQueryParam appends url-encoded key/value", () => {
    const uri = new HttpUri("https://example.com/api");
    const withParam = uri.addQueryParam("q", "foo bar");
    expect(withParam.query).toBe("q=foo%20bar");
  });

  it("addQueryParams appends multiple pairs joined with &", () => {
    const uri = new HttpUri("https://example.com/api?existing=1");
    const withParams = uri.addQueryParams([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(withParams.query).toBe("existing=1&a=1&b=2");
  });

  it("parses query params via getQueryParams, decoding values", () => {
    const uri = new HttpUri("https://example.com/api?q=foo%20bar&flag");
    const params = uri.getQueryParams();
    expect(params).toEqual([
      ["q", "foo bar"],
      ["flag", null],
    ]);
  });

  it("equals compares underlying string for HttpUri and string", () => {
    const a = new HttpUri("https://example.com/api");
    const b = new HttpUri("https://example.com/api");
    expect(a.equals(b)).toBe(true);
    expect(a.equals("https://example.com/api")).toBe(true);
    expect(a.equals("https://example.com/other")).toBe(false);
  });

  describe("combine (operator + equivalent)", () => {
    it("prefers the relative URL entirely when it has its own scheme", () => {
      const base = new HttpUri("https://example.com/api");
      const relative = new HttpUri("http://other.com/redirected");
      expect(HttpUri.combine(base, relative).toString()).toBe("http://other.com/redirected");
    });

    it("keeps base scheme but takes relative host+path when relative has a host", () => {
      const base = new HttpUri("https://example.com/api");
      const relative = new HttpUri("//other.com/redirected");
      const result = HttpUri.combine(base, relative);
      expect(result.scheme).toBe("https");
      expect(result.host).toBe("other.com");
      expect(result.path).toBe("/redirected");
    });

    it("resolves a path-only relative URL (typical redirect Location header) against the base", () => {
      const base = new HttpUri("https://example.com/api/books/1");
      const relative = new HttpUri("/api/books/2");
      const result = HttpUri.combine(base, relative);
      expect(result.toString()).toBe("https://example.com/api/books/2");
    });

    it("resolves a query-only relative URL against the base path", () => {
      const base = new HttpUri("https://example.com/api/books");
      const relative = new HttpUri("?page=2");
      const result = HttpUri.combine(base, relative);
      expect(result.toString()).toBe("https://example.com/api/books?page=2");
    });
  });

  it("throws on a malformed URI (scheme + path but no host)", () => {
    // A scheme followed by a single-slash path (no "//host") matches the
    // scheme and path groups but not host -- this is the exact combination
    // HttpUri.cs's Parse() guard rejects.
    expect(() => new HttpUri("https:/singlepath")).toThrow(/didn't match expected pattern/);
  });
});
