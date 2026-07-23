import { describe, expect, it } from "vitest";
import { createDiscordSettings, isValidUrl, validateDiscordSettings } from "../DiscordSettings.js";

describe("DiscordSettings", () => {
  it("defaults match the C# ctor (empty strings)", () => {
    const settings = createDiscordSettings();
    expect(settings.webHookUrl).toBe("");
    expect(settings.username).toBe("");
    expect(settings.avatar).toBe("");
    expect(settings.author).toBe("");
  });

  describe("isValidUrl", () => {
    it("rejects null/undefined/empty/whitespace", () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
      expect(isValidUrl("")).toBe(false);
      expect(isValidUrl("   ")).toBe(false);
    });

    it("rejects leading/trailing whitespace even around an otherwise-valid URL", () => {
      expect(isValidUrl(" https://discord.com/api/webhooks/1/token")).toBe(false);
      expect(isValidUrl("https://discord.com/api/webhooks/1/token ")).toBe(false);
    });

    it("rejects non-absolute / malformed URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("/relative/path")).toBe(false);
    });

    it("accepts a well-formed absolute URL", () => {
      expect(isValidUrl("https://discord.com/api/webhooks/123456/abcDEF")).toBe(true);
    });
  });

  describe("validateDiscordSettings", () => {
    it("fails when webHookUrl is invalid", () => {
      const result = validateDiscordSettings(createDiscordSettings({ webHookUrl: "" }));
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        { propertyName: "WebHookUrl", errorMessage: "Invalid Url: ''" },
      ]);
    });

    it("passes with a valid webHookUrl", () => {
      const result = validateDiscordSettings(
        createDiscordSettings({ webHookUrl: "https://discord.com/api/webhooks/1/t" })
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
