import { describe, expect, it } from "vitest";
import { createTwitterSettings, validateTwitterSettings } from "../../twitter/TwitterSettings.js";

describe("TwitterSettings defaults", () => {
  it("defaults directMessage to true and authorizeNotification to startOAuth", () => {
    const settings = createTwitterSettings();
    expect(settings.directMessage).toBe(true);
    expect(settings.authorizeNotification).toBe("startOAuth");
  });
});

describe("validateTwitterSettings", () => {
  it("is valid with all required creds and a mention (required because directMessage defaults true)", () => {
    const settings = createTwitterSettings({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
      mention: "someuser",
    });

    expect(validateTwitterSettings(settings).isValid).toBe(true);
  });

  it("requires consumerKey/consumerSecret/accessToken/accessTokenSecret", () => {
    const result = validateTwitterSettings(createTwitterSettings({ mention: "x" }));

    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.propertyName)).toEqual(
      expect.arrayContaining(["consumerKey", "consumerSecret", "accessToken", "accessTokenSecret"])
    );
  });

  it("requires mention when directMessage is true", () => {
    const settings = createTwitterSettings({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
      directMessage: true,
      mention: null,
    });

    const result = validateTwitterSettings(settings);
    expect(result.errors.some((e) => e.propertyName === "mention")).toBe(true);
  });

  it("flags directMessage=false as a warning, not a hard error (AsWarning ported)", () => {
    const settings = createTwitterSettings({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
      directMessage: false,
    });

    const result = validateTwitterSettings(settings);
    const warning = result.errors.find((e) => e.propertyName === "directMessage");

    expect(warning?.isWarning).toBe(true);
    expect(result.isValid).toBe(true);
  });
});
