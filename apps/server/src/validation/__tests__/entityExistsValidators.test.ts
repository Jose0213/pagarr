import { describe, expect, it } from "vitest";
import {
  isValidDownloadClientId,
  isValidMetadataProfileId,
  isValidQualityProfileId,
  type IdExistenceCheck,
} from "../entityExistsValidators.js";

/**
 * Translated behavior tests for DownloadClientExistsValidator/
 * MetadataProfileExistsValidator/QualityProfileExistsValidator -- no direct
 * C# fixtures exist for these three (exercised indirectly through settings
 * validators in the real test suite); covers the shared
 * null/0/exists-lookup shape all three share.
 */

function fakeExistenceCheck(existingIds: number[]): IdExistenceCheck {
  return { exists: (id) => existingIds.includes(id) };
}

describe("isValidDownloadClientId", () => {
  it("is valid when null, undefined, or 0 (nothing selected)", () => {
    const check = fakeExistenceCheck([]);
    expect(isValidDownloadClientId(check, null)).toBe(true);
    expect(isValidDownloadClientId(check, undefined)).toBe(true);
    expect(isValidDownloadClientId(check, 0)).toBe(true);
  });

  it("defers to exists() for a non-zero id", () => {
    const check = fakeExistenceCheck([5]);
    expect(isValidDownloadClientId(check, 5)).toBe(true);
    expect(isValidDownloadClientId(check, 6)).toBe(false);
  });
});

describe("isValidMetadataProfileId", () => {
  it("is valid when null, undefined, or 0", () => {
    const check = fakeExistenceCheck([]);
    expect(isValidMetadataProfileId(check, null)).toBe(true);
    expect(isValidMetadataProfileId(check, undefined)).toBe(true);
    expect(isValidMetadataProfileId(check, 0)).toBe(true);
  });

  it("defers to exists() for a non-zero id", () => {
    const check = fakeExistenceCheck([1]);
    expect(isValidMetadataProfileId(check, 1)).toBe(true);
    expect(isValidMetadataProfileId(check, 2)).toBe(false);
  });
});

describe("isValidQualityProfileId", () => {
  it("is valid when null, undefined, or 0", () => {
    const check = fakeExistenceCheck([]);
    expect(isValidQualityProfileId(check, null)).toBe(true);
    expect(isValidQualityProfileId(check, undefined)).toBe(true);
    expect(isValidQualityProfileId(check, 0)).toBe(true);
  });

  it("defers to exists() for a non-zero id", () => {
    const check = fakeExistenceCheck([1]);
    expect(isValidQualityProfileId(check, 1)).toBe(true);
    expect(isValidQualityProfileId(check, 2)).toBe(false);
  });
});
