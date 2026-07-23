import { describe, expect, it } from "vitest";
import { Quality } from "../quality.js";
import { Revision } from "../revision.js";
import {
  compareQualityModels,
  newQualityModel,
  qualityModelsEqual,
  qualityModelsNotEqual,
  qualityModelToString,
} from "../qualityModel.js";

describe("newQualityModel", () => {
  it("defaults to Unknown quality and a version-1 revision", () => {
    const model = newQualityModel();
    expect(model.quality).toEqual(Quality.Unknown);
    expect(model.revision.version).toBe(1);
    expect(model.revision.real).toBe(0);
  });

  it("defaults revision to a fresh Revision when omitted", () => {
    const model = newQualityModel(Quality.MOBI);
    expect(model.quality).toEqual(Quality.MOBI);
    expect(model.revision.version).toBe(1);
  });
});

describe("compareQualityModels", () => {
  it("orders by quality weight, not by declaration order or id", () => {
    // FLAC (weight 110) should outrank MOBI (weight 10) even though MOBI has the lower id.
    const flac = newQualityModel(Quality.FLAC);
    const mobi = newQualityModel(Quality.MOBI);

    expect(compareQualityModels(flac, mobi)).toBeGreaterThan(0);
    expect(compareQualityModels(mobi, flac)).toBeLessThan(0);
  });

  it("falls back to Revision.Real, then Revision.Version, when quality weight ties", () => {
    const base = newQualityModel(Quality.EPUB);
    const higherReal = newQualityModel(Quality.EPUB, new Revision({ real: 1 }));
    const higherVersion = newQualityModel(Quality.EPUB, new Revision({ version: 2 }));

    expect(compareQualityModels(higherReal, base)).toBeGreaterThan(0);
    expect(compareQualityModels(higherVersion, base)).toBeGreaterThan(0);
    expect(compareQualityModels(base, base)).toBe(0);
  });
});

describe("QualityModel equality", () => {
  it("equal when quality and revision both match", () => {
    const a = newQualityModel(Quality.EPUB, new Revision({ version: 2 }));
    const b = newQualityModel(Quality.EPUB, new Revision({ version: 2 }));

    expect(qualityModelsEqual(a, b)).toBe(true);
    expect(qualityModelsNotEqual(a, b)).toBe(false);
  });

  it("not equal when quality differs", () => {
    const a = newQualityModel(Quality.EPUB);
    const b = newQualityModel(Quality.MOBI);

    expect(qualityModelsEqual(a, b)).toBe(false);
  });

  it("not equal when revision differs", () => {
    const a = newQualityModel(Quality.EPUB, new Revision({ version: 1 }));
    const b = newQualityModel(Quality.EPUB, new Revision({ version: 2 }));

    expect(qualityModelsEqual(a, b)).toBe(false);
  });
});

describe("qualityModelToString", () => {
  it("formats as '{Quality} {Revision}'", () => {
    expect(qualityModelToString(newQualityModel(Quality.EPUB))).toBe("EPUB v1");
    expect(qualityModelToString(newQualityModel(Quality.MP3, new Revision({ real: 1 })))).toBe(
      "MP3 v1 Real:1"
    );
  });
});
