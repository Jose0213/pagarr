import { describe, expect, it } from "vitest";
import {
  createSendGridSettings,
  validateSendGridSettings,
} from "../../sendgrid/SendGridSettings.js";

describe("SendGridSettings defaults", () => {
  it("defaults baseUrl to the v3 API root", () => {
    expect(createSendGridSettings().baseUrl).toBe("https://api.sendgrid.com/v3/");
  });
});

describe("validateSendGridSettings", () => {
  it("is valid with apiKey/from/recipients populated", () => {
    const settings = createSendGridSettings({
      apiKey: "SG.test",
      from: "from@example.com",
      recipients: ["to@example.com"],
    });

    expect(validateSendGridSettings(settings).isValid).toBe(true);
  });

  it("requires a non-empty apiKey", () => {
    const settings = createSendGridSettings({
      from: "from@example.com",
      recipients: ["to@example.com"],
    });
    const result = validateSendGridSettings(settings);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "apiKey")).toBe(true);
  });

  it("requires from to be a valid email address", () => {
    const settings = createSendGridSettings({
      apiKey: "key",
      from: "not-an-email",
      recipients: ["to@example.com"],
    });
    const result = validateSendGridSettings(settings);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "from")).toBe(true);
  });

  it("requires at least one recipient", () => {
    const settings = createSendGridSettings({ apiKey: "key", from: "from@example.com" });
    const result = validateSendGridSettings(settings);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "recipients")).toBe(true);
  });
});
