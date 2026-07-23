import { describe, expect, it } from "vitest";
import { CustomFormatAllowedByProfileSpecification } from "../../specifications/customFormatAllowedByProfileSpecification.js";
import { calculateCustomFormatScore } from "../../../profiles/qualities/qualityProfile.js";
import type { ProfileFormatItem } from "../../../profiles/profileFormatItem.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Revision } from "../../../qualities/revision.js";
import {
  makeAuthor,
  makeParsedBookInfo,
  makeQualityProfile,
  makeRemoteBook,
} from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/CustomFormatAllowedByProfileSpecificationFixture.cs. */
describe("CustomFormatAllowedByProfileSpecification", () => {
  const subject = new CustomFormatAllowedByProfileSpecification();

  const format1: CustomFormat = { id: 1, name: "Awesome Format" };
  const format2: CustomFormat = { id: 2, name: "Cool Format" };
  const allRegisteredFormats = [format1, format2];

  /**
   * Ported from NzbDrone.Core.Test/CustomFormats/CustomFormatsTestHelpers.cs's
   * `GetSampleFormatItems(params string[] allowed)`: every registered format
   * (from `GivenCustomFormats`) gets a `ProfileFormatItem` -- ones named in
   * `allowed` get score `2^index` (index within the allowed list), everything
   * else gets `-2^allowedCount`.
   */
  function sampleFormatItems(...allowedNames: string[]): ProfileFormatItem[] {
    const allowedItems = allRegisteredFormats
      .filter((f) => allowedNames.includes(f.name))
      .map((f, index) => ({ format: f, score: 2 ** index }));

    const disallowedItems = allRegisteredFormats
      .filter((f) => !allowedNames.includes(f.name))
      .map((f) => ({ format: f, score: -1 * 2 ** allowedItems.length }));

    return [...disallowedItems, ...allowedItems];
  }

  function build(minFormatScore: number) {
    const profile = makeQualityProfile({ cutoff: Quality.FLAC.id, minFormatScore });
    const author = makeAuthor({}, profile);
    return makeRemoteBook({
      author,
      parsedBookInfo: makeParsedBookInfo({
        quality: newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      }),
    });
  }

  it("should_allow_if_format_score_greater_than_min", () => {
    const remoteBook = build(1);
    remoteBook.customFormats = [format1];
    remoteBook.author.qualityProfile.formatItems = sampleFormatItems(format1.name);
    remoteBook.customFormatScore = calculateCustomFormatScore(
      remoteBook.author.qualityProfile,
      remoteBook.customFormats
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_deny_if_format_score_not_greater_than_min", () => {
    const remoteBook = build(1);
    remoteBook.customFormats = [format2];
    remoteBook.author.qualityProfile.formatItems = sampleFormatItems(format1.name);
    remoteBook.customFormatScore = calculateCustomFormatScore(
      remoteBook.author.qualityProfile,
      remoteBook.customFormats
    );

    // format2 isn't in the "allowed" list -> disallowed score -2^1 = -2, well below minFormatScore of 1.
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_deny_if_format_score_not_greater_than_min_2", () => {
    const remoteBook = build(1);
    remoteBook.customFormats = [format2, format1];
    remoteBook.author.qualityProfile.formatItems = sampleFormatItems(format1.name);
    remoteBook.customFormatScore = calculateCustomFormatScore(
      remoteBook.author.qualityProfile,
      remoteBook.customFormats
    );

    // format1 (allowed, index 0) = +1; format2 (disallowed) = -2. Combined score = -1 < minFormatScore of 1.
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_allow_if_all_format_is_defined_in_profile", () => {
    const remoteBook = build(1);
    remoteBook.customFormats = [format2, format1];
    remoteBook.author.qualityProfile.formatItems = sampleFormatItems(format1.name, format2.name);
    remoteBook.customFormatScore = calculateCustomFormatScore(
      remoteBook.author.qualityProfile,
      remoteBook.customFormats
    );

    // Both allowed: format1 (index 0) = +1, format2 (index 1) = +2. Combined score = 3 > minFormatScore of 1.
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_deny_if_no_format_was_parsed_and_min_score_positive", () => {
    const remoteBook = build(1);
    remoteBook.customFormats = [];
    remoteBook.author.qualityProfile.formatItems = sampleFormatItems(format1.name, format2.name);
    remoteBook.customFormatScore = calculateCustomFormatScore(
      remoteBook.author.qualityProfile,
      remoteBook.customFormats
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_allow_if_no_format_was_parsed_min_score_is_zero", () => {
    const remoteBook = build(0);
    remoteBook.customFormats = [];
    remoteBook.author.qualityProfile.formatItems = sampleFormatItems(format1.name, format2.name);
    remoteBook.customFormatScore = calculateCustomFormatScore(
      remoteBook.author.qualityProfile,
      remoteBook.customFormats
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });
});
