import { describe, expect, it } from "vitest";
import { Distance } from "../bookImport/identification/distance.js";

/**
 * Translated from NzbDrone.Core.Test/MediaFiles/BookImport/Identification/DistanceFixture.cs.
 */
describe("Distance", () => {
  it("test_add", () => {
    const dist = new Distance();
    dist.add("add", 1.0);
    expect([...dist.penalties.entries()]).toEqual([["add", [1.0]]]);
  });

  it("test_equality", () => {
    const dist = new Distance();
    dist.addEquality("equality", "ghi", ["abc", "def", "ghi"]);
    expect(dist.penalties.get("equality")).toEqual([0.0]);

    dist.addEquality("equality", "xyz", ["abc", "def", "ghi"]);
    expect(dist.penalties.get("equality")).toEqual([0.0, 1.0]);

    dist.addEquality("equality", "abc", ["abc", "def", "ghi"]);
    expect(dist.penalties.get("equality")).toEqual([0.0, 1.0, 0.0]);
  });

  it("test_add_bool", () => {
    const dist = new Distance();
    dist.addBool("expr", true);
    expect(dist.penalties.get("expr")).toEqual([1.0]);

    dist.addBool("expr", false);
    expect(dist.penalties.get("expr")).toEqual([1.0, 0.0]);
  });

  it("test_add_number", () => {
    const dist = new Distance();
    dist.addNumber("number", 1, 1);
    expect(dist.penalties.get("number")).toEqual([0.0]);

    dist.addNumber("number", 1, 2);
    expect(dist.penalties.get("number")).toEqual([0.0, 1.0]);

    dist.addNumber("number", 2, 1);
    expect(dist.penalties.get("number")).toEqual([0.0, 1.0, 1.0]);

    dist.addNumber("number", -1, 2);
    expect(dist.penalties.get("number")).toEqual([0.0, 1.0, 1.0, 1.0, 1.0, 1.0]);
  });

  it("test_add_priority_value", () => {
    const dist = new Distance();
    dist.addPriority("priority", "abc", ["abc"]);
    expect(dist.penalties.get("priority")).toEqual([0.0]);

    dist.addPriority("priority", "def", ["abc", "def"]);
    expect(dist.penalties.get("priority")).toEqual([0.0, 0.5]);

    dist.addPriority("priority", "xyz", ["abc", "def"]);
    expect(dist.penalties.get("priority")).toEqual([0.0, 0.5, 1.0]);
  });

  it("test_add_priority_list", () => {
    const dist = new Distance();
    dist.addPriorityMany("priority", ["abc"], ["abc"]);
    expect(dist.penalties.get("priority")).toEqual([0.0]);

    dist.addPriorityMany("priority", ["def"], ["abc"]);
    expect(dist.penalties.get("priority")).toEqual([0.0, 1.0]);

    dist.addPriorityMany("priority", ["abc", "xyz"], ["abc"]);
    expect(dist.penalties.get("priority")).toEqual([0.0, 1.0, 0.0]);

    dist.addPriorityMany("priority", ["def", "xyz"], ["abc", "def"]);
    expect(dist.penalties.get("priority")).toEqual([0.0, 1.0, 0.0, 0.5]);
  });

  it("test_add_ratio", () => {
    const dist = new Distance();
    dist.addRatio("ratio", 25, 100);
    expect(dist.penalties.get("ratio")).toEqual([0.25]);

    dist.addRatio("ratio", 10, 5);
    expect(dist.penalties.get("ratio")).toEqual([0.25, 1.0]);

    dist.addRatio("ratio", -5, 5);
    expect(dist.penalties.get("ratio")).toEqual([0.25, 1.0, 0.0]);

    dist.addRatio("ratio", 5, 0);
    expect(dist.penalties.get("ratio")).toEqual([0.25, 1.0, 0.0, 0.0]);
  });

  it("test_add_string", () => {
    const dist = new Distance();
    dist.addString("string", "abcd", "bcde");
    expect(dist.penalties.get("string")).toEqual([0.5]);
  });

  it("test_add_string_none", () => {
    const dist = new Distance();
    dist.addString("string", "", "bcd");
    expect(dist.penalties.get("string")).toEqual([1.0]);
  });

  it("test_add_string_both_none", () => {
    const dist = new Distance();
    dist.addString("string", "", "");
    expect(dist.penalties.get("string")).toEqual([0.0]);
  });

  it("test_add_string_empty_values_valid_target", () => {
    const dist = new Distance();
    dist.addString("string", [], "target");
    expect(dist.penalties.get("string")).toEqual([1.0]);
  });

  it("test_add_string_empty_values_empty_target", () => {
    const dist = new Distance();
    dist.addString("string", [], "");
    expect(dist.penalties.get("string")).toEqual([0.0]);
  });

  it("test_add_string_empty_options_valid_value", () => {
    const dist = new Distance();
    dist.addString("string", "value", []);
    expect(dist.penalties.get("string")).toEqual([1.0]);
  });

  it("test_add_string_empty_options_empty_value", () => {
    const dist = new Distance();
    dist.addString("string", "", []);
    expect(dist.penalties.get("string")).toEqual([0.0]);
  });

  it("test_add_string_multiple_options_multiple_values_match", () => {
    const dist = new Distance();
    dist.addString("string", ["cat", "dog"], ["dog", "mouse"]);
    expect(dist.penalties.get("string")).toEqual([0.0]);
  });

  it("test_add_string_multiple_options_multiple_values_no_match", () => {
    const dist = new Distance();
    dist.addString("string", ["cat", "dog"], ["y", "z"]);
    expect(dist.penalties.get("string")).toEqual([1.0]);
  });

  it("test_distance (normalizedDistance)", () => {
    const dist = new Distance();
    dist.add("book", 0.5);
    dist.add("media_count", 0.25);
    dist.add("media_count", 0.75);

    expect(dist.normalizedDistance()).toBe(0.5);
  });

  it("test_max_distance", () => {
    const dist = new Distance();
    dist.add("book", 0.5);
    dist.add("media_count", 0.0);
    dist.add("media_count", 0.0);

    expect(dist.maxDistance()).toBe(5.0);
  });

  it("test_raw_distance", () => {
    const dist = new Distance();
    dist.add("book", 0.5);
    dist.add("media_count", 0.25);
    dist.add("media_count", 0.5);

    expect(dist.rawDistance()).toBe(2.25);
  });

  it("reasons is empty when no penalties are recorded", () => {
    const dist = new Distance();
    expect(dist.reasons).toBe("");
  });

  it("reasons lists only keys with a positive max penalty, underscores replaced with spaces", () => {
    const dist = new Distance();
    dist.add("book_id", 0.0);
    dist.add("missing_tracks", 0.5);
    expect(dist.reasons).toBe("[missing tracks]");
  });

  it("normalizedDistanceExcluding drops the given keys from the calculation", () => {
    const dist = new Distance();
    dist.add("book", 0.0); // weight 3.0, no penalty
    dist.add("missing_tracks", 1.0); // weight 0.6, full penalty

    const withAll = dist.normalizedDistance();
    const withoutMissing = dist.normalizedDistanceExcluding(["missing_tracks"]);

    // With missing_tracks included: raw = 0.6, max = 3.6 -> 1/6.
    expect(withAll).toBeCloseTo(0.6 / 3.6, 10);
    // Excluding it leaves only the zero-penalty "book" key -> 0.
    expect(withoutMissing).toBe(0.0);
    expect(withoutMissing).toBeLessThan(withAll);
  });

  it("throws for an unknown penalty key, matching C#'s KeyNotFoundException on the Weights dictionary indexer", () => {
    const dist = new Distance();
    dist.add("not_a_real_key", 1.0);
    expect(() => dist.normalizedDistance()).toThrow();
  });
});
