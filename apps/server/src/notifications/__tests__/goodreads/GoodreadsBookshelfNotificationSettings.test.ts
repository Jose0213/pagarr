import { describe, expect, it } from "vitest";
import {
  createGoodreadsBookshelfNotificationSettings,
  validateGoodreadsBookshelfNotificationSettings,
} from "../../goodreads/Bookshelf/GoodreadsBookshelfNotificationSettings.js";

describe("validateGoodreadsBookshelfNotificationSettings", () => {
  it("is valid when only addIds is populated", () => {
    const settings = createGoodreadsBookshelfNotificationSettings({
      accessToken: "at",
      accessTokenSecret: "ats",
      addIds: ["to-read"],
    });

    expect(validateGoodreadsBookshelfNotificationSettings(settings).isValid).toBe(true);
  });

  it("is valid when only removeIds is populated", () => {
    const settings = createGoodreadsBookshelfNotificationSettings({
      accessToken: "at",
      accessTokenSecret: "ats",
      removeIds: ["currently-reading"],
    });

    expect(validateGoodreadsBookshelfNotificationSettings(settings).isValid).toBe(true);
  });

  it("fails when neither addIds nor removeIds is populated", () => {
    const settings = createGoodreadsBookshelfNotificationSettings({
      accessToken: "at",
      accessTokenSecret: "ats",
    });

    const result = validateGoodreadsBookshelfNotificationSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.propertyName)).toEqual(
      expect.arrayContaining(["addIds", "removeIds"])
    );
  });

  it("still requires the base accessToken/accessTokenSecret rules", () => {
    const settings = createGoodreadsBookshelfNotificationSettings({ addIds: ["to-read"] });
    const result = validateGoodreadsBookshelfNotificationSettings(settings);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "accessToken")).toBe(true);
  });
});
