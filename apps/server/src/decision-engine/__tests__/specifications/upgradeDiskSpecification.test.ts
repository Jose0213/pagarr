import { describe, expect, it, vi } from "vitest";
import { UpgradeDiskSpecification } from "../../specifications/upgradeDiskSpecification.js";
import { UpgradableSpecification } from "../../specifications/upgradableSpecification.js";
import type { IConfigService } from "../../../config/configService.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
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
 * Ported from NzbDrone.Core.Test/DecisionEngineTests/UpgradeDiskSpecificationFixture.cs.
 *
 * NOTE: the real C# fixture is annotated `[Ignore("Pending Readarr fixes")]`
 * -- it does not run in the upstream test suite (a known-broken area of
 * Readarr's own tests, not something to "fix" during a faithful port per
 * PORT_PLAN.md's port-first-patch-later discipline). This file therefore
 * does NOT translate that fixture's specific (currently-disabled)
 * assertions; instead it covers the straightforward, unambiguous behavior
 * of `UpgradeDiskSpecification.IsSatisfiedBy` directly against
 * `UpgradableSpecification.IsUpgradable`, which is exercised in depth by
 * upgradableSpecification.test.ts already.
 */
describe("UpgradeDiskSpecification", () => {
  function makeFiles(...qualities: ReturnType<typeof newQualityModel>[]): BookFile[] {
    return qualities.map((quality, i) => ({
      id: i + 1,
      path: `/file${i}`,
      quality,
      releaseGroup: null,
      dateAdded: new Date().toISOString(),
    }));
  }

  function makeSubject(files: BookFile[], formatsByFile: CustomFormat[] = []) {
    const configService = { downloadPropersAndRepacks: "PreferAndUpgrade" } as IConfigService;
    const upgradable = new UpgradableSpecification(configService);
    const mediaFileService: MediaFileServiceLike = { getFilesByBook: vi.fn(() => files) };
    const formatService: CustomFormatCalculationServiceLike = {
      parseCustomFormatForRemoteBook: vi.fn(() => []),
      parseCustomFormatForFile: vi.fn(() => formatsByFile),
      parseCustomFormatForHistory: vi.fn(() => []),
    };

    return new UpgradeDiskSpecification(upgradable, formatService, mediaFileService);
  }

  function build(newQuality: ReturnType<typeof newQualityModel>) {
    const profile = makeQualityProfile({ upgradeAllowed: true, items: getDefaultQualities() });
    const author = makeAuthor({}, profile);
    return makeRemoteBook({
      author,
      books: [makeBook({ id: 1 })],
      parsedBookInfo: makeParsedBookInfo({ quality: newQuality }),
    });
  }

  it("accepts when there are no existing files for the book", () => {
    const subject = makeSubject([]);
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC)), null).accepted).toBe(true);
  });

  it("accepts when the new quality is better than every existing file", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.MP3)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC)), null).accepted).toBe(true);
  });

  it("rejects when the new quality is equal to an existing file", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.FLAC)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC)), null).accepted).toBe(false);
  });

  it("rejects when the new quality is a downgrade for an existing file", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.FLAC)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.MP3)), null).accepted).toBe(false);
  });

  it("stops (accepts) immediately on encountering a null file, matching the C# `if (file == null) return Decision.Accept()` short-circuit", () => {
    const subject = makeSubject([null as unknown as BookFile]);
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC)), null).accepted).toBe(true);
  });
});
