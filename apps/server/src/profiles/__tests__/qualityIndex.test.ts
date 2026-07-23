import { describe, expect, it } from "vitest";
import { QualityIndex } from "../qualities/qualityIndex.js";

/** Ported from NzbDrone.Core.Test/Profiles/Qualities/QualityIndexCompareToFixture.cs. */
describe("QualityIndex.compareTo", () => {
  describe("respectGroupOrder = true", () => {
    it.each([
      [1, 0, 1, 0, 0],
      [1, 1, 1, 0, 1],
      [2, 0, 1, 0, 1],
      [1, 0, 1, 1, -1],
      [1, 0, 2, 0, -1],
    ])(
      "compareTo(%i,%i vs %i,%i) => %i",
      (leftIndex, leftGroupIndex, rightIndex, rightGroupIndex, expected) => {
        const left = new QualityIndex(leftIndex, leftGroupIndex);
        const right = new QualityIndex(rightIndex, rightGroupIndex);
        expect(left.compareTo(right, true)).toBe(expected);
      }
    );
  });

  describe("respectGroupOrder = false", () => {
    it.each([
      [1, 0, 1, 0, 0],
      [1, 1, 1, 0, 0],
      [2, 0, 1, 0, 1],
      [1, 0, 1, 1, 0],
      [1, 0, 2, 0, -1],
    ])(
      "compareTo(%i,%i vs %i,%i) => %i",
      (leftIndex, leftGroupIndex, rightIndex, rightGroupIndex, expected) => {
        const left = new QualityIndex(leftIndex, leftGroupIndex);
        const right = new QualityIndex(rightIndex, rightGroupIndex);
        expect(left.compareTo(right, false)).toBe(expected);
      }
    );
  });

  it("compareTo(null) returns 1, matching C#'s null-right-hand-side special case", () => {
    const left = new QualityIndex(1, 0);
    expect(left.compareTo(null)).toBe(1);
  });
});
