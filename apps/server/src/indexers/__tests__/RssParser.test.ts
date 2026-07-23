import { describe, expect, it } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { UnsupportedFeedException } from "../exceptions/UnsupportedFeedException.js";
import { IndexerRequest } from "../IndexerRequest.js";
import { IndexerResponse } from "../IndexerResponse.js";
import { RssParser } from "../RssParser.js";

function responseFor(content: string, statusCode = 200): IndexerResponse {
  const request = new HttpRequest("https://example.com/feed");
  const httpResponse = new HttpResponse(request, new HttpHeader(), content, statusCode);
  return new IndexerResponse(new IndexerRequest(request), httpResponse);
}

const SIMPLE_FEED = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Some Release Name</title>
    <guid>abc-123</guid>
    <pubDate>Sat, 14 Mar 2015 17:10:42 -0400</pubDate>
    <link>https://example.com/download/1</link>
  </item>
</channel></rss>`;

describe("RssParser", () => {
  describe("parseResponse", () => {
    it("parses title/guid/publishDate/downloadUrl from a basic RSS item", () => {
      const parser = new RssParser();
      const releases = parser.parseResponse(responseFor(SIMPLE_FEED));

      expect(releases).toHaveLength(1);
      expect(releases[0]!.title).toBe("Some Release Name");
      expect(releases[0]!.guid).toBe("abc-123");
      expect(releases[0]!.downloadUrl).toBe("https://example.com/download/1");
      expect(new Date(releases[0]!.publishDate).toISOString()).toBe(
        new Date("Sat, 14 Mar 2015 17:10:42 -0400").toISOString()
      );
    });

    it("returns an empty array for a feed with no channel/item elements", () => {
      const parser = new RssParser();
      const releases = parser.parseResponse(
        responseFor('<?xml version="1.0"?><rss><channel></channel></rss>')
      );
      expect(releases).toEqual([]);
    });

    it("throws UnsupportedFeedException when an item has no pubDate", () => {
      const parser = new RssParser();
      const feed = `<?xml version="1.0"?><rss><channel><item><title>No Date</title><guid>x</guid></item></channel></rss>`;
      expect(() => parser.parseResponse(responseFor(feed))).toThrow(UnsupportedFeedException);
    });

    it("throws IndexerException for an unexpected non-2xx/non-5xx status code", () => {
      const parser = new RssParser();
      expect(() => parser.parseResponse(responseFor(SIMPLE_FEED, 404))).toThrow(
        /unexpected StatusCode/
      );
    });
  });

  describe("parseSize (static)", () => {
    it("parses a bare digit string as bytes", () => {
      expect(RssParser.parseSize("12345", true)).toBe(12345);
    });

    it("parses decimal GB using the decimal prefix when defaultToBinaryPrefix is false", () => {
      expect(RssParser.parseSize("1.5 GB", false)).toBe(Math.round(1.5 * 1000 ** 3));
    });

    it("parses GB using the binary prefix when defaultToBinaryPrefix is true", () => {
      expect(RssParser.parseSize("1.5 GB", true)).toBe(Math.round(1.5 * 1024 ** 3));
    });

    it("always uses binary prefix for explicit GiB/MiB/KiB units regardless of the flag", () => {
      expect(RssParser.parseSize("2 GiB", false)).toBe(Math.round(2 * 1024 ** 3));
    });

    it("returns 0 for an empty string", () => {
      expect(RssParser.parseSize("", true)).toBe(0);
    });

    it("returns 0 when no size pattern matches", () => {
      expect(RssParser.parseSize("no size info here", true)).toBe(0);
    });
  });
});
