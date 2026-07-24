import { describe, expect, it } from "vitest";
import { createGoodreadsBookshelfImportListSettings } from "../bookshelf/GoodreadsBookshelfImportListSettings.js";
import { createGoodreadsOwnedBooksImportListSettings } from "../owned-books/GoodreadsOwnedBooksImportListSettings.js";
import { createGoodreadsListImportListSettings } from "../lists/GoodreadsListImportListSettings.js";
import { createGoodreadsSeriesImportListSettings } from "../series/GoodreadsSeriesImportListSettings.js";

describe("Goodreads settings validation", () => {
  describe("GoodreadsBookshelfImportListSettings", () => {
    it("requires AccessToken, AccessTokenSecret, and at least one bookshelf", () => {
      const result = createGoodreadsBookshelfImportListSettings().validate();

      expect(result.isValid).toBe(false);
      const props = result.errors.map((e) => e.propertyName);
      expect(props).toContain("accessToken");
      expect(props).toContain("accessTokenSecret");
      expect(props).toContain("bookshelfIds");
    });

    it("is valid with tokens and at least one bookshelf", () => {
      const result = createGoodreadsBookshelfImportListSettings({
        accessToken: "t",
        accessTokenSecret: "s",
        bookshelfIds: ["read"],
      }).validate();

      expect(result.isValid).toBe(true);
    });

    it("defaults SignIn to startOAuth (matches the C# ctor)", () => {
      expect(createGoodreadsBookshelfImportListSettings().signIn).toBe("startOAuth");
    });
  });

  describe("GoodreadsOwnedBooksImportListSettings", () => {
    it("requires just AccessToken/AccessTokenSecret (no bookshelf field)", () => {
      const result = createGoodreadsOwnedBooksImportListSettings().validate();
      expect(result.isValid).toBe(false);

      const valid = createGoodreadsOwnedBooksImportListSettings({
        accessToken: "t",
        accessTokenSecret: "s",
      }).validate();
      expect(valid.isValid).toBe(true);
    });
  });

  describe("GoodreadsListImportListSettings", () => {
    it("requires ListId > 0", () => {
      expect(createGoodreadsListImportListSettings().validate().isValid).toBe(false);
      expect(createGoodreadsListImportListSettings({ listId: 42 }).validate().isValid).toBe(true);
    });

    it("defaults BaseUrl to www.goodreads.com (unlike GoodreadsSettingsBase, which leaves it blank)", () => {
      expect(createGoodreadsListImportListSettings().baseUrl).toBe("www.goodreads.com");
    });
  });

  describe("GoodreadsSeriesImportListSettings", () => {
    it("requires SeriesId > 0", () => {
      expect(createGoodreadsSeriesImportListSettings().validate().isValid).toBe(false);
      expect(createGoodreadsSeriesImportListSettings({ seriesId: 7 }).validate().isValid).toBe(
        true
      );
    });
  });
});
