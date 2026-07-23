import { describe, expect, it } from "vitest";
import {
  buildValidationResult,
  hasErrors,
  filterValidationResult,
  throwOnError,
  ValidationException,
  type ValidationFailure,
} from "../validationResult.js";

/**
 * Translated behavior tests for NzbDroneValidationResult/
 * NzbDroneValidationFailure/NzbDroneValidationExtensions -- no direct C#
 * fixture exists for these (they're exercised indirectly through every
 * validator fixture in NzbDrone.Core.Test/ValidationTests and elsewhere),
 * so this covers the documented partition/filter/throw behavior directly.
 */

describe("buildValidationResult", () => {
  it("is valid with no failures", () => {
    const result = buildValidationResult([]);
    expect(result.isValid).toBe(true);
    expect(result.hasWarnings).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("is invalid when a non-warning failure is present", () => {
    const failures: ValidationFailure[] = [{ propertyName: "Host", errorMessage: "Invalid host" }];
    const result = buildValidationResult(failures);
    expect(result.isValid).toBe(false);
    expect(result.hasWarnings).toBe(false);
  });

  it("is valid (but flagged hasWarnings) when only warning failures are present", () => {
    const failures: ValidationFailure[] = [
      { propertyName: "MusicCategory", errorMessage: "should not be empty", isWarning: true },
    ];
    const result = buildValidationResult(failures);
    expect(result.isValid).toBe(true);
    expect(result.hasWarnings).toBe(true);
  });

  it("orders errors before warnings in the combined list regardless of push order", () => {
    const warning: ValidationFailure = { propertyName: "A", errorMessage: "warn", isWarning: true };
    const error: ValidationFailure = { propertyName: "B", errorMessage: "err" };
    const result = buildValidationResult([warning, error]);
    expect(result.errors).toEqual([error, warning]);
  });
});

describe("hasErrors", () => {
  it("is false for an empty list", () => {
    expect(hasErrors([])).toBe(false);
  });

  it("is false when every failure is a warning", () => {
    expect(hasErrors([{ propertyName: "A", errorMessage: "x", isWarning: true }])).toBe(false);
  });

  it("is true when any failure is not a warning", () => {
    expect(
      hasErrors([
        { propertyName: "A", errorMessage: "x", isWarning: true },
        { propertyName: "B", errorMessage: "y" },
      ])
    ).toBe(true);
  });
});

describe("filterValidationResult", () => {
  it("keeps only failures matching the given property names", () => {
    const result = buildValidationResult([
      { propertyName: "Host", errorMessage: "bad host" },
      { propertyName: "Port", errorMessage: "bad port" },
    ]);

    const filtered = filterValidationResult(result, "Port");
    expect(filtered.errors).toEqual([{ propertyName: "Port", errorMessage: "bad port" }]);
    expect(filtered.isValid).toBe(false);
  });

  it("returns a valid result when nothing matches the filter", () => {
    const result = buildValidationResult([{ propertyName: "Host", errorMessage: "bad host" }]);
    const filtered = filterValidationResult(result, "Port");
    expect(filtered.isValid).toBe(true);
    expect(filtered.errors).toEqual([]);
  });
});

describe("throwOnError", () => {
  it("does not throw for a valid result", () => {
    expect(() => throwOnError(buildValidationResult([]))).not.toThrow();
  });

  it("throws a ValidationException carrying the failures for an invalid result", () => {
    const failures: ValidationFailure[] = [{ propertyName: "Host", errorMessage: "bad host" }];
    const result = buildValidationResult(failures);

    let caught: unknown;
    try {
      throwOnError(result);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ValidationException);
    expect((caught as ValidationException).errors).toEqual(failures);
  });
});
