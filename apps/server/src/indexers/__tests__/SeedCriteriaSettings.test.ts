import { describe, expect, it } from "vitest";
import {
  createSeedCriteriaSettings,
  validateSeedCriteriaSettings,
} from "../SeedCriteriaSettings.js";

describe("validateSeedCriteriaSettings", () => {
  it("produces no failures for null/unset fields", () => {
    const settings = createSeedCriteriaSettings();
    expect(validateSeedCriteriaSettings(settings)).toEqual([]);
  });

  it("warns (not errors) when seedRatio is zero or negative", () => {
    const settings = createSeedCriteriaSettings({ seedRatio: 0 });
    const failures = validateSeedCriteriaSettings(settings);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.propertyName).toBe("SeedRatio");
    expect(failures[0]!.isWarning).toBe(true);
  });

  it("warns when seedTime is zero or negative", () => {
    const settings = createSeedCriteriaSettings({ seedTime: 0 });
    const failures = validateSeedCriteriaSettings(settings);
    expect(failures.some((f) => f.propertyName === "SeedTime")).toBe(true);
  });

  it("warns when discographySeedTime is zero or negative", () => {
    const settings = createSeedCriteriaSettings({ discographySeedTime: -1 });
    const failures = validateSeedCriteriaSettings(settings);
    expect(failures.some((f) => f.propertyName === "DiscographySeedTime")).toBe(true);
  });

  it("does not warn for a positive seedRatio", () => {
    const settings = createSeedCriteriaSettings({ seedRatio: 1.5 });
    expect(validateSeedCriteriaSettings(settings)).toEqual([]);
  });

  it("adds an additional 'leads to H&R' warning when below the configured minimum", () => {
    const settings = createSeedCriteriaSettings({ seedRatio: 0.5 });
    const failures = validateSeedCriteriaSettings(settings, 1.0);
    expect(failures.some((f) => f.errorMessage.includes("H&R"))).toBe(true);
  });

  it("does not add the minimum-based warning when at or above the minimum", () => {
    const settings = createSeedCriteriaSettings({ seedRatio: 1.0 });
    const failures = validateSeedCriteriaSettings(settings, 1.0);
    expect(failures.some((f) => f.errorMessage.includes("H&R"))).toBe(false);
  });
});
