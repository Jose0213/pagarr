import { describe, expect, it } from "vitest";
import { HttpRequestBuilder } from "../HttpRequestBuilder.js";
import { HttpAccept } from "../HttpAccept.js";

describe("HttpRequestBuilder", () => {
  it("builds a GET request with the resource path and query params applied", () => {
    const request = new HttpRequestBuilder("https://api.example.com")
      .resource("books")
      .addQueryParam("limit", 10)
      .build();

    expect(request.method).toBe("GET");
    expect(request.url.toString()).toBe("https://api.example.com/books?limit=10");
  });

  it("sets method to POST via post()", () => {
    const request = new HttpRequestBuilder("https://api.example.com").resource("books").post().build();

    expect(request.method).toBe("POST");
  });

  it("applies custom headers set on the builder", () => {
    const request = new HttpRequestBuilder("https://api.example.com")
      .setHeader("X-Api-Key", "secret")
      .build();

    expect(request.headers.get("X-Api-Key")).toBe("secret");
  });

  it("applies HttpAccept as the Accept header", () => {
    const request = new HttpRequestBuilder("https://api.example.com").accept(HttpAccept.Json).build();

    expect(request.headers.accept).toBe("application/json");
  });

  it("applies cookies set on the builder onto the request", () => {
    const request = new HttpRequestBuilder("https://api.example.com")
      .setCookie("session", "abc123")
      .build();

    expect(request.cookies.get("session")).toBe("abc123");
  });

  it("replaces query params in place when replace=true", () => {
    const builder = new HttpRequestBuilder("https://api.example.com")
      .addQueryParam("page", 1)
      .addQueryParam("page", 2, true);

    expect(builder.queryParams).toEqual([["page", "2"]]);
  });

  it("substitutes URL segments", () => {
    const request = new HttpRequestBuilder("https://api.example.com")
      .resource("books/{id}")
      .setSegment("id", "42")
      .build();

    expect(request.url.toString()).toBe("https://api.example.com/books/42");
  });

  it("setSegment throws if the segment placeholder isn't present", () => {
    const builder = new HttpRequestBuilder("https://api.example.com").resource("books");

    expect(() => builder.setSegment("id", "42")).toThrow(/is not defined in Uri/);
  });

  it("addFormParameter requires POST method", () => {
    const builder = new HttpRequestBuilder("https://api.example.com");
    expect(() => builder.addFormParameter("a", "b")).toThrow(/must be POST/);
  });

  it("small form data (no file, no content-type, small body) is sent as urlencoded", () => {
    const request = new HttpRequestBuilder("https://api.example.com")
      .post()
      .addFormParameter("name", "foo")
      .addFormParameter("value", "bar")
      .build();

    expect(request.headers.contentType).toBe("application/x-www-form-urlencoded");
    expect(Buffer.from(request.contentData!).toString("utf8")).toBe("name=foo&value=bar");
  });

  it("form data with a file upload is sent as multipart", () => {
    const request = new HttpRequestBuilder("https://api.example.com")
      .post()
      .addFormUpload("file", "book.epub", new TextEncoder().encode("hello"), "application/epub+zip")
      .build();

    expect(request.headers.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const body = Buffer.from(request.contentData!).toString("utf8");
    expect(body).toContain('name="file"');
    expect(body).toContain('filename="book.epub"');
    expect(body).toContain("Content-Type: application/epub+zip");
    expect(body).toContain("hello");
  });

  it("cannot combine explicit body content with form data", () => {
    // Mirrors HttpRequestBuilder.ApplyFormData's guard: `apply()` (called
    // from build()) applies form data as its last step, so the only way to
    // hit this guard through the public API is if request.contentData was
    // already populated before apply() ran -- e.g. a subclass overriding
    // createRequest() to pre-populate content. We exercise the guard
    // directly the same way such a subclass would trigger it.
    class PrePopulatedBuilder extends HttpRequestBuilder {
      protected override createRequest() {
        const request = super.createRequest();
        request.setContent("already-set");
        return request;
      }
    }

    const builder = new PrePopulatedBuilder("https://api.example.com").post().addFormParameter("a", "1");

    expect(() => builder.build()).toThrow(/Cannot send HttpRequest Body and FormData simultaneously/);
  });

  it("clone() deep-copies mutable collections so mutating the clone doesn't affect the original", () => {
    const original = new HttpRequestBuilder("https://api.example.com").addQueryParam("a", "1");
    const clone = original.clone();
    clone.addQueryParam("b", "2");

    expect(original.queryParams).toEqual([["a", "1"]]);
    expect(clone.queryParams).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("createFactory()/create() clones the root builder's state for each new builder", () => {
    const root = new HttpRequestBuilder("https://api.example.com").setHeader("X-Api-Key", "secret");
    const factory = root.createFactory();

    const first = factory.create().resource("books");
    const second = factory.create().resource("authors");

    expect(first.build().url.toString()).toBe("https://api.example.com/books");
    expect(second.build().url.toString()).toBe("https://api.example.com/authors");
    expect(second.build().headers.get("X-Api-Key")).toBe("secret");
  });

  it("host/port constructor overload builds the expected base URL", () => {
    const request = new HttpRequestBuilder(true, "indexer.local", 9117, "torznab").resource("api").build();
    expect(request.url.toString()).toBe("https://indexer.local:9117/torznab/api");
  });
});
