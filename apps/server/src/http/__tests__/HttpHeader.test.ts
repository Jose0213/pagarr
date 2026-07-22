import { describe, expect, it } from "vitest";
import { HttpHeader } from "../HttpHeader.js";

describe("HttpHeader", () => {
  it("is case-insensitive for get/set/containsKey", () => {
    const headers = new HttpHeader();
    headers.set("Content-Type", "application/json");

    expect(headers.containsKey("content-type")).toBe(true);
    expect(headers.containsKey("CONTENT-TYPE")).toBe(true);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("set() replaces existing values, add() accumulates them", () => {
    const headers = new HttpHeader();
    headers.add("Set-Cookie", "a=1");
    headers.add("Set-Cookie", "b=2");
    expect(headers.getValues("Set-Cookie")).toEqual(["a=1", "b=2"]);

    headers.set("Set-Cookie", "c=3");
    expect(headers.getValues("Set-Cookie")).toEqual(["c=3"]);
  });

  it("getSingleValue throws when multiple values are present", () => {
    const headers = new HttpHeader();
    headers.add("X-Multi", "1");
    headers.add("X-Multi", "2");

    expect(() => headers.getSingleValue("X-Multi")).toThrow(/occur only once/);
  });

  it("getSingleValue returns null when the header is absent", () => {
    const headers = new HttpHeader();
    expect(headers.getSingleValue("X-Missing")).toBeNull();
  });

  it("contentType / accept / contentLength convenience accessors round-trip", () => {
    const headers = new HttpHeader();
    headers.contentType = "text/html; charset=iso-8859-1";
    headers.accept = "application/json";
    headers.contentLength = 42;

    expect(headers.contentType).toBe("text/html; charset=iso-8859-1");
    expect(headers.accept).toBe("application/json");
    expect(headers.contentLength).toBe(42);

    headers.contentType = null;
    expect(headers.contentType).toBeNull();
    expect(headers.containsKey("Content-Type")).toBe(false);
  });

  it("getEncodingFromContentType extracts charset, defaults to utf-8", () => {
    expect(HttpHeader.getEncodingFromContentType("text/html; charset=iso-8859-1")).toBe(
      "iso-8859-1"
    );
    expect(HttpHeader.getEncodingFromContentType("application/json")).toBe("utf-8");
    expect(HttpHeader.getEncodingFromContentType("")).toBe("utf-8");
  });

  it("iterates all key/value pairs including duplicates", () => {
    const headers = new HttpHeader();
    headers.add("X-A", "1");
    headers.add("X-B", "2");
    headers.add("X-A", "3");

    expect([...headers]).toEqual([
      ["X-A", "1"],
      ["X-A", "3"],
      ["X-B", "2"],
    ]);
  });

  it("constructing from another HttpHeader copies entries independently", () => {
    const original = new HttpHeader();
    original.set("X-Foo", "bar");

    const copy = new HttpHeader(original);
    copy.set("X-Foo", "baz");

    expect(original.get("X-Foo")).toBe("bar");
    expect(copy.get("X-Foo")).toBe("baz");
  });

  it("parseCookies splits a Cookie-header-style string into pairs", () => {
    expect(HttpHeader.parseCookies("a=1; b=2")).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });
});
