import { describe, expect, it } from "vitest";
import { createTelegramSettings, validateTelegramSettings } from "../TelegramSettings.js";

describe("TelegramSettings", () => {
  it("requires botToken and chatId", () => {
    const result = validateTelegramSettings(createTelegramSettings({ botToken: "", chatId: "" }));
    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.propertyName)).toEqual(["BotToken", "ChatId"]);
  });

  it("allows a null topicId (general topic)", () => {
    const result = validateTelegramSettings(
      createTelegramSettings({ botToken: "t", chatId: "c", topicId: null })
    );
    expect(result.isValid).toBe(true);
  });

  it("rejects a topicId of 1 or less", () => {
    const zero = validateTelegramSettings(
      createTelegramSettings({ botToken: "t", chatId: "c", topicId: 0 })
    );
    const one = validateTelegramSettings(
      createTelegramSettings({ botToken: "t", chatId: "c", topicId: 1 })
    );
    const negative = validateTelegramSettings(
      createTelegramSettings({ botToken: "t", chatId: "c", topicId: -5 })
    );

    for (const result of [zero, one, negative]) {
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        { propertyName: "TopicId", errorMessage: "Topic ID must be greater than 1 or empty" },
      ]);
    }
  });

  it("accepts a topicId greater than 1", () => {
    const result = validateTelegramSettings(
      createTelegramSettings({ botToken: "t", chatId: "c", topicId: 2 })
    );
    expect(result.isValid).toBe(true);
  });
});
