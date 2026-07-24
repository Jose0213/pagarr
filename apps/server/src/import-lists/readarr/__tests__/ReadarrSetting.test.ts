import { describe, expect, it } from "vitest";
import { createReadarrSettings } from "../ReadarrSetting.js";

describe("ReadarrSettings", () => {
  it("is valid with a well-formed URL and a non-empty API key", () => {
    const result = createReadarrSettings({
      baseUrl: "http://remote:8787",
      apiKey: "key",
    }).validate();
    expect(result.isValid).toBe(true);
  });

  it("is invalid when BaseUrl is blank", () => {
    const result = createReadarrSettings({ baseUrl: "", apiKey: "key" }).validate();
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "baseUrl")).toBe(true);
  });

  it("is invalid when ApiKey is empty", () => {
    const result = createReadarrSettings({ baseUrl: "http://x", apiKey: "" }).validate();
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "apiKey")).toBe(true);
  });

  it("defaults ProfileIds/TagIds/RootFolderPaths to empty arrays", () => {
    const settings = createReadarrSettings();
    expect(settings.profileIds).toEqual([]);
    expect(settings.tagIds).toEqual([]);
    expect(settings.rootFolderPaths).toEqual([]);
  });
});
