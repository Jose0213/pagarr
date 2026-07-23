import { describe, expect, it } from "vitest";
import { MetadataRequestBuilder } from "../metadataRequestBuilder.js";

describe("MetadataRequestBuilder", () => {
  it("uses the default base URL when no override is configured", () => {
    const builder = new MetadataRequestBuilder("https://api.hardcover.app/v1");
    const request = builder.getRequestBuilder().create().resource("graphql").build();

    expect(request.url.toString()).toBe("https://api.hardcover.app/v1/graphql");
  });

  it("uses the configured override when set, trimming a trailing slash", () => {
    const builder = new MetadataRequestBuilder(
      "https://api.hardcover.app/v1",
      "https://my-proxy.example.com/"
    );
    const request = builder.getRequestBuilder().create().resource("graphql").build();

    expect(request.url.toString()).toBe("https://my-proxy.example.com/graphql");
  });

  it("falls back to the default when the override is null, undefined, or blank", () => {
    for (const override of [null, undefined, "   "]) {
      const builder = new MetadataRequestBuilder("https://openlibrary.org", override);
      const request = builder.getRequestBuilder().create().resource("search.json").build();
      expect(request.url.toString()).toBe("https://openlibrary.org/search.json");
    }
  });
});
