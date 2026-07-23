import { describe, expect, it } from "vitest";
import {
  calculateCustomFormatScore,
  firstAllowedQuality,
  getIndex,
  lastAllowedQuality,
  newQualityProfile,
} from "../qualities/qualityProfile.js";
import { newQualityItem } from "../qualities/qualityProfileQualityItem.js";
import type { Quality } from "../../qualities/quality.js";
import type { CustomFormat } from "../customFormat.js";

const MOBI: Quality = { id: 2, name: "MOBI" };
const EPUB: Quality = { id: 3, name: "EPUB" };
const AZW3: Quality = { id: 4, name: "AZW3" };

/** Ported behavior from QualityProfile.cs's instance methods (see the C# source's own doc comments). */
describe("QualityProfile", () => {
  describe("firstAllowedQuality/lastAllowedQuality", () => {
    it("returns the leaf quality for a non-group item", () => {
      const profile = newQualityProfile({
        items: [
          newQualityItem({ quality: MOBI, allowed: false }),
          newQualityItem({ quality: EPUB, allowed: true }),
          newQualityItem({ quality: AZW3, allowed: true }),
        ],
      });

      expect(firstAllowedQuality(profile)).toEqual(EPUB);
      expect(lastAllowedQuality(profile)).toEqual(AZW3);
    });

    it("returns a member quality when the first/last allowed item is a group", () => {
      const profile = newQualityProfile({
        items: [
          newQualityItem({ quality: MOBI, allowed: false }),
          newQualityItem({
            id: 1000,
            name: "Ebook Group",
            allowed: true,
            items: [
              newQualityItem({ quality: EPUB, allowed: true }),
              newQualityItem({ quality: AZW3, allowed: true }),
            ],
          }),
        ],
      });

      expect(firstAllowedQuality(profile)).toEqual(EPUB);
      expect(lastAllowedQuality(profile)).toEqual(AZW3);
    });

    it("throws when no item is allowed", () => {
      const profile = newQualityProfile({
        items: [newQualityItem({ quality: MOBI, allowed: false })],
      });

      expect(() => firstAllowedQuality(profile)).toThrow();
      expect(() => lastAllowedQuality(profile)).toThrow();
    });
  });

  describe("getIndex", () => {
    const profile = newQualityProfile({
      items: [
        newQualityItem({ quality: MOBI, allowed: true }),
        newQualityItem({
          id: 1000,
          name: "Ebook Group",
          allowed: true,
          items: [
            newQualityItem({ quality: EPUB, allowed: true }),
            newQualityItem({ quality: AZW3, allowed: true }),
          ],
        }),
      ],
    });

    it("matches a leaf quality by id", () => {
      expect(getIndex(profile, MOBI).index).toBe(0);
    });

    it("matches a group by its own id", () => {
      expect(getIndex(profile, 1000).index).toBe(1);
    });

    it("matches a quality nested in a group, collapsing to the group index by default", () => {
      const index = getIndex(profile, AZW3);
      expect(index.index).toBe(1);
      expect(index.groupIndex).toBe(0);
    });

    it("respects group order when respectGroupOrder is true", () => {
      const index = getIndex(profile, AZW3, true);
      expect(index.index).toBe(1);
      expect(index.groupIndex).toBe(1);
    });

    it("returns a default QualityIndex(0,0) when nothing matches", () => {
      const index = getIndex(profile, 9999);
      expect(index.index).toBe(0);
      expect(index.groupIndex).toBe(0);
    });
  });

  describe("calculateCustomFormatScore", () => {
    it("sums scores for formats present in both the profile and the input list", () => {
      const formatA: CustomFormat = { id: 1, name: "A" };
      const formatB: CustomFormat = { id: 2, name: "B" };
      const formatC: CustomFormat = { id: 3, name: "C" };

      const profile = newQualityProfile({
        formatItems: [
          { format: formatA, score: 10 },
          { format: formatB, score: -5 },
          { format: formatC, score: 100 },
        ],
      });

      expect(calculateCustomFormatScore(profile, [formatA, formatB])).toBe(5);
    });

    it("returns 0 for an empty formats list", () => {
      const profile = newQualityProfile({
        formatItems: [{ format: { id: 1, name: "A" }, score: 10 }],
      });

      expect(calculateCustomFormatScore(profile, [])).toBe(0);
    });
  });
});
