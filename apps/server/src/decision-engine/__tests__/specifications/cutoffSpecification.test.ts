import { describe, expect, it, vi } from "vitest";
import { CutoffSpecification } from "../../specifications/cutoffSpecification.js";
import { UpgradableSpecification } from "../../specifications/upgradableSpecification.js";
import type { IConfigService } from "../../../config/configService.js";
import type {
  BookFile,
  CustomFormatCalculationServiceLike,
  MediaFileServiceLike,
} from "../../mediaFile.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import {
  getDefaultQualities,
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeRemoteBook,
} from "../testFixtures.js";

/**
 * No dedicated C# fixture exists for the `CutoffSpecification` class itself
 * (NzbDrone.Core.Test/DecisionEngineTests/CutoffSpecificationFixture.cs
 * actually exercises `UpgradableSpecification.CutoffNotMet` -- fully
 * translated in upgradableSpecification.test.ts). These are new tests
 * covering `CutoffSpecification.IsSatisfiedBy` itself, which loops existing
 * on-disk files and rejects once any file already meets the profile cutoff.
 */
describe("CutoffSpecification", () => {
  function makeFiles(...qualities: ReturnType<typeof newQualityModel>[]): BookFile[] {
    return qualities.map((quality, i) => ({
      id: i + 1,
      path: `/file${i}`,
      quality,
      releaseGroup: null,
      dateAdded: new Date().toISOString(),
    }));
  }

  function makeSubject(files: BookFile[]) {
    const configService = { downloadPropersAndRepacks: "PreferAndUpgrade" } as IConfigService;
    const upgradable = new UpgradableSpecification(configService);
    const mediaFileService: MediaFileServiceLike = { getFilesByBook: vi.fn(() => files) };
    const formatService: CustomFormatCalculationServiceLike = {
      parseCustomFormatForRemoteBook: vi.fn(() => []),
      parseCustomFormatForFile: vi.fn(() => []),
      parseCustomFormatForHistory: vi.fn(() => []),
    };

    return new CutoffSpecification(upgradable, formatService, mediaFileService);
  }

  function build(newQuality: ReturnType<typeof newQualityModel>, cutoff = Quality.MP3.id) {
    const profile = makeQualityProfile({
      upgradeAllowed: true,
      cutoff,
      items: getDefaultQualities(),
    });
    const author = makeAuthor({}, profile);
    return makeRemoteBook({
      author,
      books: [makeBook({ id: 1 })],
      parsedBookInfo: makeParsedBookInfo({ quality: newQuality }),
    });
  }

  it("accepts when there are no existing files", () => {
    const subject = makeSubject([]);
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.MP3)), null).accepted).toBe(true);
  });

  it("accepts when the existing file is below cutoff", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.Unknown)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.MP3)), null).accepted).toBe(true);
  });

  it("rejects when an existing file already meets cutoff", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.MP3)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC)), null).accepted).toBe(false);
  });

  it("rejects as soon as any one of multiple existing files meets cutoff", () => {
    const subject = makeSubject(
      makeFiles(newQualityModel(Quality.Unknown), newQualityModel(Quality.MP3))
    );
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC)), null).accepted).toBe(false);
  });
});
