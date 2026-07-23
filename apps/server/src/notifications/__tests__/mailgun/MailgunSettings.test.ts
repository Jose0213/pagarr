import { describe, expect, it } from "vitest";
import { createMailgunSettings, validateMailgunSettings } from "../../mailgun/MailgunSettings.js";

describe("validateMailgunSettings", () => {
  it("is valid with apiKey/from/recipients populated", () => {
    const settings = createMailgunSettings({
      apiKey: "key",
      from: "from@example.com",
      recipients: ["to@example.com"],
    });

    expect(validateMailgunSettings(settings).isValid).toBe(true);
  });

  it("requires apiKey, from, and at least one recipient", () => {
    const result = validateMailgunSettings(createMailgunSettings());

    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.propertyName)).toEqual(
      expect.arrayContaining(["apiKey", "from", "recipients"])
    );
  });
});
