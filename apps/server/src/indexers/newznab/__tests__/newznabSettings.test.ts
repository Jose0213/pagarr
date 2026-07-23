import { describe, expect, it } from "vitest";
import { createNewznabSettings } from "../newznabSettings.js";

describe("NewznabSettings validation", () => {
  it.each(["http://nzbs.org", "http:///www.nzbplanet.net"])(
    "requires an apikey for a whitelisted host (%s)",
    (url) => {
      const settings = createNewznabSettings({ apiKey: "", baseUrl: url });

      const result = settings.validate();

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.propertyName === "ApiKey")).toBe(true);
    }
  );

  it.each(["", "  ", null as unknown as string])(
    "flags an invalid url but does not additionally require an apikey (%s)",
    (url) => {
      const settings = createNewznabSettings({ apiKey: "", baseUrl: url });

      const result = settings.validate();

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.propertyName === "ApiKey")).toBe(false);
      expect(result.errors.some((e) => e.propertyName === "BaseUrl")).toBe(true);
    }
  );

  it("does not require an apikey for a non-whitelisted host", () => {
    const settings = createNewznabSettings({ apiKey: "", baseUrl: "http://nzbs2.org" });

    const result = settings.validate();

    expect(result.isValid).toBe(true);
  });

  it("requires at least one category", () => {
    const settings = createNewznabSettings({ baseUrl: "http://nzbs2.org", categories: [] });

    const result = settings.validate();

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.errorMessage.includes("Categories"))).toBe(true);
  });

  it("defaults ApiPath to /api and Categories to the standard Readarr set", () => {
    const settings = createNewznabSettings({ baseUrl: "http://nzbs2.org" });

    expect(settings.apiPath).toBe("/api");
    expect(settings.categories).toEqual([3030, 7020, 8010]);
  });
});
