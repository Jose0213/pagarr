import { describe, expect, it } from "vitest";
import { newLocalBook } from "../../parser/model/localBook.js";
import { newParsedTrackInfo } from "../../parser/model/parsedTrackInfo.js";
import { newParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { Quality } from "../../qualities/quality.js";
import { AggregateQuality } from "../bookImport/aggregation/aggregators/aggregateQuality.js";

describe("AggregateQuality", () => {
  const aggregator = new AggregateQuality();

  it("prefers fileTrackInfo quality over folder/download-client info", () => {
    const localTrack = newLocalBook();
    localTrack.fileTrackInfo = { ...newParsedTrackInfo(), quality: newQualityModel(Quality.FLAC) };
    localTrack.folderTrackInfo = { ...newParsedBookInfo(), quality: newQualityModel(Quality.MP3) };

    const result = aggregator.aggregate(localTrack, false);

    expect(result.quality?.quality.id).toBe(Quality.FLAC.id);
  });

  it("falls back to folderTrackInfo quality when fileTrackInfo has none", () => {
    const localTrack = newLocalBook();
    localTrack.fileTrackInfo = { ...newParsedTrackInfo(), quality: null };
    localTrack.folderTrackInfo = { ...newParsedBookInfo(), quality: newQualityModel(Quality.MP3) };

    const result = aggregator.aggregate(localTrack, false);

    expect(result.quality?.quality.id).toBe(Quality.MP3.id);
  });

  it("falls back to downloadClientBookInfo quality when neither file nor folder info has one", () => {
    const localTrack = newLocalBook();
    localTrack.fileTrackInfo = { ...newParsedTrackInfo(), quality: null };
    localTrack.folderTrackInfo = { ...newParsedBookInfo(), quality: null };
    localTrack.downloadClientBookInfo = {
      ...newParsedBookInfo(),
      quality: newQualityModel(Quality.EPUB),
    };

    const result = aggregator.aggregate(localTrack, false);

    expect(result.quality?.quality.id).toBe(Quality.EPUB.id);
  });

  it("leaves quality null when none of the three sources have one", () => {
    const localTrack = newLocalBook();
    localTrack.fileTrackInfo = null;
    localTrack.folderTrackInfo = null;
    localTrack.downloadClientBookInfo = null;

    const result = aggregator.aggregate(localTrack, false);

    expect(result.quality).toBeNull();
  });
});
