import { describe, expect, it } from "vitest";
import { createLazyLibrarianImportSettings } from "../LazyLibrarianImportSettings.js";

describe("LazyLibrarianImportSettings", () => {
  it("defaults BaseUrl to http://localhost:5299", () => {
    expect(createLazyLibrarianImportSettings().baseUrl).toBe("http://localhost:5299");
  });

  it("is valid with a well-formed URL and a non-empty API key", () => {
    const result = createLazyLibrarianImportSettings({ apiKey: "key" }).validate();
    expect(result.isValid).toBe(true);
  });

  it("is invalid when BaseUrl is not a valid URL", () => {
    const result = createLazyLibrarianImportSettings({
      baseUrl: "not a url",
      apiKey: "key",
    }).validate();
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "baseUrl")).toBe(true);
  });

  it("is invalid when ApiKey is empty", () => {
    const result = createLazyLibrarianImportSettings({ apiKey: "" }).validate();
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "apiKey")).toBe(true);
  });
});
