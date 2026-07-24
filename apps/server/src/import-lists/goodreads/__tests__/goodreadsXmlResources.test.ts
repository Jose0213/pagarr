import { describe, expect, it } from "vitest";
import { GoodreadsException } from "../GoodreadsException.js";
import {
  deserializeGoodreadsResponse,
  parseOwnedBook,
  parseReview,
  parseUserShelf,
} from "../goodreadsXmlResources.js";

describe("goodreadsXmlResources", () => {
  describe("deserializeGoodreadsResponse", () => {
    it("parses a <reviews> list of <review><book>...", () => {
      const xml = `<?xml version="1.0"?>
        <GoodreadsResponse>
          <reviews start="1" end="2" total="2">
            <review>
              <id>1</id>
              <book>
                <id>111</id>
                <title_without_series>Mistborn</title_without_series>
                <authors>
                  <author><id>9</id><name>Brandon Sanderson</name></author>
                </authors>
              </book>
            </review>
            <review>
              <id>2</id>
              <book>
                <id>222</id>
                <title_without_series>Elantris</title_without_series>
                <authors>
                  <author><id>9</id><name>Brandon Sanderson</name></author>
                </authors>
              </book>
            </review>
          </reviews>
        </GoodreadsResponse>`;

      const result = deserializeGoodreadsResponse(xml, "reviews", parseReview);

      expect(result).toHaveLength(2);
      expect(result?.[0]?.book?.id).toBe("111");
      expect(result?.[0]?.book?.titleWithoutSeries).toBe("Mistborn");
      expect(result?.[0]?.book?.authors[0]?.name).toBe("Brandon Sanderson");
      expect(result?.[1]?.book?.id).toBe("222");
    });

    it("parses a <shelves> list of <shelf><name>...", () => {
      const xml = `<GoodreadsResponse>
          <shelves>
            <shelf><name>read</name></shelf>
            <shelf><name>to-read</name></shelf>
          </shelves>
        </GoodreadsResponse>`;

      const result = deserializeGoodreadsResponse(xml, "shelves", parseUserShelf);

      expect(result?.map((s) => s.name)).toEqual(["read", "to-read"]);
    });

    it("parses an <owned_books> list of <owned_book><book>...", () => {
      const xml = `<GoodreadsResponse>
          <owned_books>
            <owned_book>
              <id>1</id>
              <book>
                <id>333</id>
                <title_without_series>Warbreaker</title_without_series>
                <authors><author><id>9</id><name>Brandon Sanderson</name></author></authors>
              </book>
            </owned_book>
          </owned_books>
        </GoodreadsResponse>`;

      const result = deserializeGoodreadsResponse(xml, "owned_books", parseOwnedBook);

      expect(result).toHaveLength(1);
      expect(result?.[0]?.book?.titleWithoutSeries).toBe("Warbreaker");
    });

    it("returns null when the named element is absent", () => {
      const xml = `<GoodreadsResponse><somethingElse/></GoodreadsResponse>`;

      expect(deserializeGoodreadsResponse(xml, "reviews", parseReview)).toBeNull();
    });

    it("returns null (not a throw) for malformed XML", () => {
      expect(deserializeGoodreadsResponse("<not valid", "reviews", parseReview)).toBeNull();
    });

    it("a bare <error> root throws before the Deserialize-proper logic even runs (see next describe block)", () => {
      const xml = `<error>Invalid API key</error>`;

      expect(() => deserializeGoodreadsResponse(xml, "reviews", parseReview)).toThrow(
        GoodreadsException
      );
    });
  });

  describe("ThrowIfException (four Goodreads error response shapes)", () => {
    it("throws GoodreadsException for a bare <error> element", () => {
      expect(() =>
        deserializeGoodreadsResponse("<error>Invalid API key</error>", "reviews", parseReview)
      ).toThrow(/Invalid API key/);
    });

    it("throws GoodreadsException joining multiple <errors><error> children", () => {
      const xml = `<errors><error>First problem</error><error>Second problem</error></errors>`;

      expect(() => deserializeGoodreadsResponse(xml, "reviews", parseReview)).toThrow(
        /First problem/
      );
    });

    it("throws GoodreadsException for a <hash> status/error shape", () => {
      const xml = `<hash><status>401</status><error>Unauthorized</error></hash>`;

      expect(() => deserializeGoodreadsResponse(xml, "reviews", parseReview)).toThrow(
        /Unauthorized/
      );
    });

    it("throws GoodreadsException preferring friendly > detail > generic for GoodreadsResponse/error", () => {
      const xml = `<GoodreadsResponse>
          <error>
            plain text
            <generic>generic message</generic>
            <detail>detail message</detail>
            <friendly>friendly message</friendly>
          </error>
        </GoodreadsResponse>`;

      expect(() => deserializeGoodreadsResponse(xml, "reviews", parseReview)).toThrow(
        /friendly message/
      );
    });

    it("does not throw for a well-formed non-error response", () => {
      const xml = `<GoodreadsResponse><reviews></reviews></GoodreadsResponse>`;

      expect(() => deserializeGoodreadsResponse(xml, "reviews", parseReview)).not.toThrow();
    });
  });
});
