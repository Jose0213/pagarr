import { describe, expect, it } from "vitest";
import { Quality, qualitiesEqual, qualitiesNotEqual, qualityFromId, qualityToString } from "../quality.js";

// Translated from NzbDrone.Core.Test/Qualities/QualityFixture.cs

describe("Quality int<->Quality conversion", () => {
  const fromIntCases: Array<[number, ReturnType<typeof qualityFromId>]> = [
    [0, Quality.Unknown],
    [1, Quality.PDF],
    [2, Quality.MOBI],
    [3, Quality.EPUB],
    [4, Quality.AZW3],
    [10, Quality.MP3],
    [11, Quality.FLAC],
  ];

  it.each(fromIntCases)("converts int %i to the expected quality", (source, expected) => {
    expect(qualityFromId(source)).toEqual(expected);
  });

  const toIntCases: Array<[ReturnType<typeof qualityFromId>, number]> = [
    [Quality.Unknown, 0],
    [Quality.PDF, 1],
    [Quality.MOBI, 2],
    [Quality.EPUB, 3],
    [Quality.AZW3, 4],
    [Quality.MP3, 10],
    [Quality.FLAC, 11],
  ];

  it.each(toIntCases)("converts quality %o to the expected int", (source, expected) => {
    expect(source.id).toBe(expected);
  });

  it("throws for an id that does not match a known quality", () => {
    expect(() => qualityFromId(999)).toThrow(/ID does not match a known quality/);
    expect(() => qualityFromId(5)).toThrow(/ID does not match a known quality/);
  });
});

describe("Quality equality", () => {
  it("qualities with the same id are equal, even distinct object instances", () => {
    const a = qualityFromId(2);
    const b = qualityFromId(2);

    expect(qualitiesEqual(a, b)).toBe(true);
    expect(qualitiesNotEqual(a, b)).toBe(false);
  });

  it("qualities with different ids are not equal", () => {
    expect(qualitiesEqual(Quality.MOBI, Quality.EPUB)).toBe(false);
    expect(qualitiesNotEqual(Quality.MOBI, Quality.EPUB)).toBe(true);
  });

  it("toString returns the quality name", () => {
    expect(qualityToString(Quality.EPUB)).toBe("EPUB");
    expect(qualityToString(Quality.Unknown)).toBe("Unknown Text");
  });
});

describe("Quality.All / DefaultQualityDefinitions", () => {
  it("All contains every known quality exactly once", () => {
    expect(Quality.All).toHaveLength(9);
    const ids = Quality.All.map((q) => q.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 4, 10, 11, 12, 13]);
  });

  it("DefaultQualityDefinitions has one entry per known quality", () => {
    expect(Quality.DefaultQualityDefinitions).toHaveLength(Quality.All.length);

    const seedIds = Quality.DefaultQualityDefinitions.map((d) => d.quality.id).sort((a, b) => a - b);
    const allIds = Quality.All.map((q) => q.id).sort((a, b) => a - b);
    expect(seedIds).toEqual(allIds);
  });

  it("FLAC has no MaxSize (unlimited), matching the C# seed data", () => {
    const flacDefinition = Quality.DefaultQualityDefinitions.find((d) => d.quality.id === Quality.FLAC.id);
    expect(flacDefinition?.maxSize).toBeNull();
  });

  it("weights are unique and in the C# source's declared ascending order", () => {
    const weights = Quality.DefaultQualityDefinitions.map((d) => d.weight);
    expect(new Set(weights).size).toBe(weights.length);
    expect(weights).toEqual([1, 5, 10, 11, 12, 50, 100, 105, 110]);
  });
});
