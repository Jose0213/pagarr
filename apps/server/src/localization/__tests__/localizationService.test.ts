import { describe, expect, it } from "vitest";
import { LocalizationService } from "../localizationService.js";

describe("LocalizationService", () => {
  it("getLocalizationDictionary returns the full bundled English dictionary", () => {
    const service = new LocalizationService();

    const dict = service.getLocalizationDictionary();

    expect(dict["Cancel"]).toBe("Cancel");
    expect(dict["ThisKeyDefinitelyDoesNotExistInEnJson"]).toBeUndefined();
    expect(Object.keys(dict).length).toBeGreaterThan(1000);
  });

  it("getLocalizedString returns the phrase itself when the key is unknown", () => {
    const service = new LocalizationService();

    expect(service.getLocalizedString("ThisKeyDoesNotExist")).toBe("ThisKeyDoesNotExist");
  });

  it("getLocalizedString replaces {token} placeholders from the supplied tokens", () => {
    const service = new LocalizationService();

    // "GoToInterp": "Go to {0}"
    expect(service.getLocalizedString("GoToInterp", { "0": "Settings" })).toBe("Go to Settings");
  });

  it("getLocalizedString always injects an implicit appName=Readarr token", () => {
    const service = new LocalizationService();

    // "AppUpdated": "{appName} Updated"
    expect(service.getLocalizedString("AppUpdated")).toBe("Readarr Updated");
  });

  it("a caller-supplied appName token overrides the implicit default (TryAdd semantics)", () => {
    const service = new LocalizationService();

    expect(service.getLocalizedString("AppUpdated", { appName: "Custom" })).toBe("Custom Updated");
  });

  it("leaves an unmatched token placeholder as literal text", () => {
    const service = new LocalizationService();

    // "GoToInterp": "Go to {0}" -- no "0" token supplied.
    expect(service.getLocalizedString("GoToInterp")).toBe("Go to {0}");
  });

  it("throws for an empty phrase", () => {
    const service = new LocalizationService();

    expect(() => service.getLocalizedString("")).toThrow();
  });
});
