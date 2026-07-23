import { describe, expect, it } from "vitest";
import { createTorznabSettings } from "../torznabSettings.js";

describe("TorznabSettings validation", () => {
  it.each([["http://localhost:9117/", "/api"]])(
    "validates a normal url/apiPath combination (%s, %s)",
    (baseUrl, apiPath) => {
      const settings = createTorznabSettings({ baseUrl, apiPath, categories: [1] });

      expect(settings.validate().isValid).toBe(true);
    }
  );

  it("never requires an ApiKey (empty whitelist, unlike Newznab)", () => {
    // Ported from TorznabSettingsValidator: ApiKeyWhiteList = Array.Empty<string>()
    // -- preserved as-is (not "fixed" to reuse Newznab's whitelist), per this
    // module's faithful-port mandate.
    const settings = createTorznabSettings({
      baseUrl: "http://nzb.su/",
      apiKey: "",
      categories: [1],
    });

    expect(settings.validate().errors.some((e) => e.propertyName === "ApiKey")).toBe(false);
  });

  it("defaults MinimumSeeders to IndexerDefaults.MINIMUM_SEEDERS", () => {
    const settings = createTorznabSettings({ baseUrl: "http://x/", categories: [1] });
    expect(settings.minimumSeeders).toBe(1);
  });

  it("requires at least one category", () => {
    const settings = createTorznabSettings({ baseUrl: "http://x/", categories: [] });
    const result = settings.validate();
    expect(result.isValid).toBe(false);
  });
});
