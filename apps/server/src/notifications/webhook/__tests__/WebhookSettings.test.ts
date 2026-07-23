import { describe, expect, it } from "vitest";
import { createWebhookSettings, validateWebhookSettings } from "../WebhookSettings.js";
import { WebhookMethod } from "../WebhookMethod.js";

describe("createWebhookSettings", () => {
  it("defaults method to WebhookMethod.POST", () => {
    const settings = createWebhookSettings();
    expect(settings.method).toBe(WebhookMethod.POST);
  });
});

describe("validateWebhookSettings", () => {
  it("is valid for a well-formed URL", () => {
    const settings = createWebhookSettings({ url: "https://example.com/hook" });
    expect(validateWebhookSettings(settings).isValid).toBe(true);
  });

  it("rejects an empty URL", () => {
    const settings = createWebhookSettings({ url: "" });
    expect(validateWebhookSettings(settings).isValid).toBe(false);
  });

  it("rejects a malformed URL", () => {
    const settings = createWebhookSettings({ url: "not a url" });
    expect(validateWebhookSettings(settings).isValid).toBe(false);
  });
});
