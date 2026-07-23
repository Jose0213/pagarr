import { describe, expect, it } from "vitest";
import {
  createCustomScriptSettings,
  validateCustomScriptSettings,
} from "../CustomScriptSettings.js";

describe("validateCustomScriptSettings", () => {
  it("is valid for a non-empty path with no arguments", () => {
    const settings = createCustomScriptSettings({ path: "/usr/local/bin/notify.sh" });
    expect(validateCustomScriptSettings(settings).isValid).toBe(true);
  });

  it("rejects an empty path", () => {
    const settings = createCustomScriptSettings({ path: "" });
    const result = validateCustomScriptSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "Path")).toBe(true);
  });

  it("rejects a non-empty Arguments value with the real C# deprecation message (RuleFor(c => c.Arguments).Empty())", () => {
    const settings = createCustomScriptSettings({
      path: "/usr/local/bin/notify.sh",
      arguments: "--verbose",
    });
    const result = validateCustomScriptSettings(settings);

    expect(result.isValid).toBe(false);
    const failure = result.errors.find((e) => e.propertyName === "Arguments");
    expect(failure?.errorMessage).toBe("Arguments are no longer supported for custom scripts");
  });

  it("is valid when arguments is an empty string", () => {
    const settings = createCustomScriptSettings({
      path: "/usr/local/bin/notify.sh",
      arguments: "",
    });
    expect(validateCustomScriptSettings(settings).isValid).toBe(true);
  });
});
