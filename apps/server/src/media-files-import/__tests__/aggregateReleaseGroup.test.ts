import { describe, expect, it } from "vitest";
import { newLocalBook } from "../../parser/model/localBook.js";
import { newParsedTrackInfo } from "../../parser/model/parsedTrackInfo.js";
import { newParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import { AggregateReleaseGroup } from "../bookImport/aggregation/aggregators/aggregateReleaseGroup.js";

describe("AggregateReleaseGroup", () => {
  const aggregator = new AggregateReleaseGroup();

  it("prefers downloadClientBookInfo release group first", () => {
    const localTrack = newLocalBook();
    localTrack.downloadClientBookInfo = { ...newParsedBookInfo(), releaseGroup: "DRONE" };
    localTrack.folderTrackInfo = { ...newParsedBookInfo(), releaseGroup: "FOLDER" };
    localTrack.fileTrackInfo = { ...newParsedTrackInfo(), releaseGroup: "FILE" };

    const result = aggregator.aggregate(localTrack, false);

    expect(result.releaseGroup).toBe("DRONE");
  });

  it("falls back to folderTrackInfo when downloadClientBookInfo's group is blank", () => {
    const localTrack = newLocalBook();
    localTrack.downloadClientBookInfo = { ...newParsedBookInfo(), releaseGroup: "" };
    localTrack.folderTrackInfo = { ...newParsedBookInfo(), releaseGroup: "FOLDER" };
    localTrack.fileTrackInfo = { ...newParsedTrackInfo(), releaseGroup: "FILE" };

    const result = aggregator.aggregate(localTrack, false);

    expect(result.releaseGroup).toBe("FOLDER");
  });

  it("falls back to fileTrackInfo when both download-client and folder groups are blank/whitespace", () => {
    const localTrack = newLocalBook();
    localTrack.downloadClientBookInfo = { ...newParsedBookInfo(), releaseGroup: null };
    localTrack.folderTrackInfo = { ...newParsedBookInfo(), releaseGroup: "   " };
    localTrack.fileTrackInfo = { ...newParsedTrackInfo(), releaseGroup: "FILE" };

    const result = aggregator.aggregate(localTrack, false);

    expect(result.releaseGroup).toBe("FILE");
  });

  it("ends up null when no source provides a release group", () => {
    const localTrack = newLocalBook();
    localTrack.downloadClientBookInfo = null;
    localTrack.folderTrackInfo = null;
    localTrack.fileTrackInfo = null;

    const result = aggregator.aggregate(localTrack, false);

    expect(result.releaseGroup).toBeNull();
  });
});
