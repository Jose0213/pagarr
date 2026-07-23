import { describe, expect, it } from "vitest";
import { createSlackSettings, validateSlackSettings } from "../SlackSettings.js";

describe("SlackSettings", () => {
  it("requires both a valid webHookUrl and a non-empty username", () => {
    const result = validateSlackSettings(createSlackSettings({ webHookUrl: "", username: "" }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      { propertyName: "WebHookUrl", errorMessage: "Invalid Url: ''" },
      { propertyName: "Username", errorMessage: "'Username' must not be empty." },
    ]);
  });

  it("passes with a valid url and non-empty username", () => {
    const result = validateSlackSettings(
      createSlackSettings({ webHookUrl: "https://hooks.slack.com/services/x", username: "readarr" })
    );
    expect(result.isValid).toBe(true);
  });
});
