import { describe, expect, it } from "vitest";
import { QualityAllowedByProfileSpecification } from "../../specifications/qualityAllowedByProfileSpecification.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Revision } from "../../../qualities/revision.js";
import {
  getDefaultQualities,
  makeAuthor,
  makeParsedBookInfo,
  makeQualityProfile,
  makeRemoteBook,
} from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/QualityAllowedByProfileSpecificationFixture.cs. */
describe("QualityAllowedByProfileSpecification", () => {
  const subject = new QualityAllowedByProfileSpecification();

  function build(quality: typeof Quality.MP3) {
    const profile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(Quality.MP3, Quality.MP3, Quality.MP3),
    });
    const author = makeAuthor({}, profile);

    return makeRemoteBook({
      author,
      parsedBookInfo: makeParsedBookInfo({
        quality: newQualityModel(quality, new Revision({ version: 2 })),
      }),
    });
  }

  it.each([Quality.MP3, Quality.MP3, Quality.MP3])(
    "should_allow_if_quality_is_defined_in_profile: %s",
    (quality) => {
      expect(subject.isSatisfiedBy(build(quality), null).accepted).toBe(true);
    }
  );

  it.each([Quality.FLAC, Quality.Unknown])(
    "should_not_allow_if_quality_is_not_defined_in_profile: %s",
    (quality) => {
      expect(subject.isSatisfiedBy(build(quality), null).accepted).toBe(false);
    }
  );
});
