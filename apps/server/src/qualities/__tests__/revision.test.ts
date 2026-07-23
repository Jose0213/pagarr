import { describe, expect, it } from "vitest";
import {
  Revision,
  revisionGreaterThan,
  revisionGreaterThanOrEqual,
  revisionLessThan,
  revisionLessThanOrEqual,
  revisionsEqual,
  revisionsNotEqual,
} from "../revision.js";

// Translated from NzbDrone.Core.Test/Qualities/RevisionComparableFixture.cs

describe("Revision comparisons", () => {
  it("should be greater when first quality is a real", () => {
    const first = new Revision({ real: 1 });
    const second = new Revision();

    expect(revisionGreaterThan(first, second)).toBe(true);
  });

  it("should be greater when first quality is a proper", () => {
    const first = new Revision({ version: 2 });
    const second = new Revision();

    expect(revisionGreaterThan(first, second)).toBe(true);
  });

  it("should be greater when first is a proper for a real", () => {
    const first = new Revision({ real: 1, version: 2 });
    const second = new Revision({ real: 1 });

    expect(revisionGreaterThan(first, second)).toBe(true);
  });

  it("should be lesser when second quality is a real", () => {
    const first = new Revision();
    const second = new Revision({ real: 1 });

    expect(revisionLessThan(first, second)).toBe(true);
  });

  it("should be lesser when second quality is a proper", () => {
    const first = new Revision();
    const second = new Revision({ version: 2 });

    expect(revisionLessThan(first, second)).toBe(true);
  });

  it("should be lesser when second is a proper for a real", () => {
    const first = new Revision({ real: 1 });
    const second = new Revision({ real: 1, version: 2 });

    expect(revisionLessThan(first, second)).toBe(true);
  });

  it("should be equal when both real and version match", () => {
    const first = new Revision();
    const second = new Revision();

    expect(first.compareTo(second)).toBe(0);
  });

  it("should be equal when both real and version match for real", () => {
    const first = new Revision({ real: 1 });
    const second = new Revision({ real: 1 });

    expect(first.compareTo(second)).toBe(0);
  });

  it("should be equal when both real and version match for real proper", () => {
    const first = new Revision({ version: 2, real: 1 });
    const second = new Revision({ version: 2, real: 1 });

    expect(first.compareTo(second)).toBe(0);
  });

  it("equal operator tests", () => {
    const first = new Revision();
    const second = new Revision();

    expect(revisionGreaterThan(first, second)).toBe(false);
    expect(revisionLessThan(first, second)).toBe(false);
    expect(revisionsNotEqual(first, second)).toBe(false);
    expect(revisionGreaterThanOrEqual(first, second)).toBe(true);
    expect(revisionLessThanOrEqual(first, second)).toBe(true);
    expect(revisionsEqual(first, second)).toBe(true);
  });

  it("greater than operator tests", () => {
    const first = new Revision({ version: 2 });
    const second = new Revision();

    expect(revisionGreaterThan(first, second)).toBe(true);
    expect(revisionLessThan(first, second)).toBe(false);
    expect(revisionsNotEqual(first, second)).toBe(true);
    expect(revisionGreaterThanOrEqual(first, second)).toBe(true);
    expect(revisionLessThanOrEqual(first, second)).toBe(false);
    expect(revisionsEqual(first, second)).toBe(false);
  });

  it("less than operator tests", () => {
    const first = new Revision();
    const second = new Revision({ version: 2 });

    expect(revisionGreaterThan(first, second)).toBe(false);
    expect(revisionLessThan(first, second)).toBe(true);
    expect(revisionsNotEqual(first, second)).toBe(true);
    expect(revisionGreaterThanOrEqual(first, second)).toBe(false);
    expect(revisionLessThanOrEqual(first, second)).toBe(true);
    expect(revisionsEqual(first, second)).toBe(false);
  });

  it("operating on nulls", () => {
    expect(revisionLessThan(new Revision(), null)).toBe(false);
    expect(revisionLessThanOrEqual(new Revision(), null)).toBe(false);
    expect(revisionGreaterThan(new Revision(), null)).toBe(true);
    expect(revisionGreaterThanOrEqual(new Revision(), null)).toBe(true);
  });

  it("toString formats version, and appends Real when > 0", () => {
    expect(new Revision().toString()).toBe("v1");
    expect(new Revision({ version: 2 }).toString()).toBe("v2");
    expect(new Revision({ real: 1 }).toString()).toBe("v1 Real:1");
    expect(new Revision({ version: 3, real: 2 }).toString()).toBe("v3 Real:2");
  });
});
