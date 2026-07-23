import { describe, expect, it } from "vitest";
import {
  createSimplepushSettings,
  isSimplepushSettingsValid,
  validateSimplepushSettings,
} from "../SimplepushSettings.js";

describe("SimplepushSettings", () => {
  it("isSimplepushSettingsValid mirrors the C# IsValid computed property", () => {
    expect(isSimplepushSettingsValid(createSimplepushSettings({ key: "" }))).toBe(false);
    expect(isSimplepushSettingsValid(createSimplepushSettings({ key: "   " }))).toBe(false);
    expect(isSimplepushSettingsValid(createSimplepushSettings({ key: "abc" }))).toBe(true);
  });

  it("validateSimplepushSettings requires a non-empty key", () => {
    const empty = validateSimplepushSettings(createSimplepushSettings({ key: "" }));
    expect(empty.isValid).toBe(false);
    expect(empty.errors).toEqual([
      { propertyName: "Key", errorMessage: "'Key' must not be empty." },
    ]);

    const valid = validateSimplepushSettings(createSimplepushSettings({ key: "abc" }));
    expect(valid.isValid).toBe(true);
  });
});
