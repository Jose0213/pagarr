import { describe, expect, it } from "vitest";
import { Quality, type Quality as QualityType } from "../quality.js";
import { Revision } from "../revision.js";
import { newQualityModel } from "../qualityModel.js";
import {
  QualityModelComparer,
  compareQualityIndex,
  type QualityIndexLike,
  type QualityProfileLike,
} from "../qualityModelComparer.js";

// Translated from NzbDrone.Core.Test/Qualities/QualityModelComparerFixture.cs and
// NzbDrone.Core.Test/Profiles/Qualities/QualityIndexCompareToFixture.cs.
//
// The real C# fixture builds an actual `QualityProfile` (from the not-yet-ported
// Profiles module) and lets `QualityProfile.GetIndex` do the index lookup. Since
// QualityModelComparer here is ported against the small `QualityProfileLike`
// structural interface (see qualityModelComparer.ts's deviation note), these
// tests build a minimal fake implementing the same `GetIndex` contract
// (flat list index; qualities in a nested `Items` group share the parent's
// index unless `respectGroupOrder` is requested, in which case the group
// member's position within the group is used) instead of a real QualityProfile.

interface FakeQualityItem {
  quality?: QualityType;
  groupId?: number;
  items?: FakeQualityItem[];
}

class FakeQualityProfile implements QualityProfileLike {
  constructor(private readonly items: FakeQualityItem[]) {}

  getIndex(qualityId: number, respectGroupOrder = false): QualityIndexLike {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;

      if (item.quality && item.quality.id === qualityId) {
        return { index: i, groupIndex: 0 };
      }

      if (item.groupId && item.groupId === qualityId) {
        return { index: i, groupIndex: 0 };
      }

      const groupItems = item.items ?? [];
      for (let g = 0; g < groupItems.length; g++) {
        if (groupItems[g]!.quality?.id === qualityId) {
          return respectGroupOrder ? { index: i, groupIndex: g } : { index: i, groupIndex: 0 };
        }
      }
    }

    return { index: 0, groupIndex: 0 };
  }
}

/** Mirrors QualityFixture.GetDefaultQualities: Unknown, MOBI, EPUB, AZW3, MP3, FLAC, in that order. */
function defaultQualityItems(): FakeQualityItem[] {
  return [
    { quality: Quality.Unknown },
    { quality: Quality.MOBI },
    { quality: Quality.EPUB },
    { quality: Quality.AZW3 },
    { quality: Quality.MP3 },
    { quality: Quality.FLAC },
  ];
}

/** Mirrors GivenGroupedProfile: MOBI, then a group containing [EPUB, AZW3], then FLAC. */
function groupedQualityItems(): FakeQualityItem[] {
  return [
    { quality: Quality.MOBI },
    {
      groupId: 1000,
      items: [{ quality: Quality.EPUB }, { quality: Quality.AZW3 }],
    },
    { quality: Quality.FLAC },
  ];
}

describe("QualityModelComparer", () => {
  it("throws when constructed with a null/undefined profile", () => {
    expect(() => new QualityModelComparer(null as unknown as QualityProfileLike)).toThrow();
    expect(() => new QualityModelComparer(undefined as unknown as QualityProfileLike)).toThrow();
  });

  it("should be greater when first quality is greater than second", () => {
    const subject = new QualityModelComparer(new FakeQualityProfile(defaultQualityItems()));

    const first = newQualityModel(Quality.FLAC);
    const second = newQualityModel(Quality.MOBI);

    expect(subject.compare(first, second)).toBeGreaterThan(0);
  });

  it("should be lesser when second quality is greater than first", () => {
    const subject = new QualityModelComparer(new FakeQualityProfile(defaultQualityItems()));

    const first = newQualityModel(Quality.MOBI);
    const second = newQualityModel(Quality.FLAC);

    expect(subject.compare(first, second)).toBeLessThan(0);
  });

  it("should be greater when first quality is a proper for the same quality", () => {
    const subject = new QualityModelComparer(new FakeQualityProfile(defaultQualityItems()));

    const first = newQualityModel(Quality.MOBI, new Revision({ version: 2 }));
    const second = newQualityModel(Quality.MOBI, new Revision({ version: 1 }));

    expect(subject.compare(first, second)).toBeGreaterThan(0);
  });

  it("should be greater when using a custom profile ordering", () => {
    // GivenCustomProfile: allowed = [AZW3, MOBI] => Except(allowed).Concat(allowed)
    // puts EPUB, MP3, FLAC, Unknown first (declared-but-not-allowed order),
    // then AZW3, then MOBI last -- so MOBI's index is greater than AZW3's.
    const items: FakeQualityItem[] = [
      { quality: Quality.Unknown },
      { quality: Quality.EPUB },
      { quality: Quality.MP3 },
      { quality: Quality.FLAC },
      { quality: Quality.AZW3 },
      { quality: Quality.MOBI },
    ];
    const subject = new QualityModelComparer(new FakeQualityProfile(items));

    const first = newQualityModel(Quality.MOBI);
    const second = newQualityModel(Quality.AZW3);

    expect(subject.compare(first, second)).toBeGreaterThan(0);
  });

  it("should ignore group order by default", () => {
    const subject = new QualityModelComparer(new FakeQualityProfile(groupedQualityItems()));

    const first = newQualityModel(Quality.EPUB);
    const second = newQualityModel(Quality.AZW3);

    expect(subject.compare(first, second)).toBe(0);
  });

  it("should respect group order when requested", () => {
    const subject = new QualityModelComparer(new FakeQualityProfile(groupedQualityItems()));

    const first = newQualityModel(Quality.EPUB);
    const second = newQualityModel(Quality.AZW3);

    expect(subject.compare(first, second, true)).toBeLessThan(0);
  });
});

// Translated from QualityIndexCompareToFixture.cs
describe("compareQualityIndex", () => {
  it.each([
    [1, 0, 1, 0, 0],
    [1, 1, 1, 0, 1],
    [2, 0, 1, 0, 1],
    [1, 0, 1, 1, -1],
    [1, 0, 2, 0, -1],
  ])(
    "respectGroupOrder=true: (%i,%i) vs (%i,%i) => %i",
    (leftIndex, leftGroupIndex, rightIndex, rightGroupIndex, expected) => {
      const left: QualityIndexLike = { index: leftIndex, groupIndex: leftGroupIndex };
      const right: QualityIndexLike = { index: rightIndex, groupIndex: rightGroupIndex };

      expect(compareQualityIndex(left, right, true)).toBe(expected);
    }
  );

  it.each([
    [1, 0, 1, 0, 0],
    [1, 1, 1, 0, 0],
    [2, 0, 1, 0, 1],
    [1, 0, 1, 1, 0],
    [1, 0, 2, 0, -1],
  ])(
    "respectGroupOrder=false: (%i,%i) vs (%i,%i) => %i",
    (leftIndex, leftGroupIndex, rightIndex, rightGroupIndex, expected) => {
      const left: QualityIndexLike = { index: leftIndex, groupIndex: leftGroupIndex };
      const right: QualityIndexLike = { index: rightIndex, groupIndex: rightGroupIndex };

      expect(compareQualityIndex(left, right, false)).toBe(expected);
    }
  );

  it("treats a missing right-hand index as greater (matches C#'s null == 1 case)", () => {
    const left: QualityIndexLike = { index: 0, groupIndex: 0 };
    expect(compareQualityIndex(left, null, true)).toBe(1);
    expect(compareQualityIndex(left, undefined, false)).toBe(1);
  });
});
