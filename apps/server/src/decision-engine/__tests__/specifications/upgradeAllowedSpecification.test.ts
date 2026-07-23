import { describe, expect, it, vi } from "vitest";
import { UpgradeAllowedSpecification } from "../../specifications/upgradeAllowedSpecification.js";
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
import { Revision } from "../../../qualities/revision.js";
import {
  getDefaultQualities,
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeRemoteBook,
} from "../testFixtures.js";

/**
 * Ported from NzbDrone.Core.Test/DecisionEngineTests/UpgradeAllowedSpecificationFixture.cs
 * -- despite the file name, that C# fixture tests `UpgradableSpecification.
 * IsUpgradeAllowed` directly (its `CoreTest<UpgradableSpecification>`), which
 * is already covered thoroughly in upgradableSpecification.test.ts. This file
 * instead covers the actual `UpgradeAllowedSpecification` wrapper class
 * (the one that reads existing on-disk files via MediaFileService), which
 * has no dedicated C# fixture of its own.
 */
describe("UpgradeAllowedSpecification", () => {
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

    return new UpgradeAllowedSpecification(upgradable, formatService, mediaFileService);
  }

  function build(newQuality: ReturnType<typeof newQualityModel>, upgradeAllowed: boolean) {
    const profile = makeQualityProfile({ upgradeAllowed, items: getDefaultQualities() });
    const author = makeAuthor({}, profile);
    return makeRemoteBook({
      author,
      books: [makeBook({ id: 1 })],
      parsedBookInfo: makeParsedBookInfo({ quality: newQuality }),
    });
  }

  it("accepts when there are no existing files", () => {
    const subject = makeSubject([]);
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC), true), null).accepted).toBe(
      true
    );
  });

  it("accepts when the profile allows upgrades and the new quality is better", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.MP3)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC), true), null).accepted).toBe(
      true
    );
  });

  it("rejects when the profile does not allow upgrades and the new quality is better", () => {
    const subject = makeSubject(makeFiles(newQualityModel(Quality.MP3)));
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC), false), null).accepted).toBe(
      false
    );
  });

  it("skips null files without throwing", () => {
    const subject = makeSubject([null as unknown as BookFile]);
    expect(subject.isSatisfiedBy(build(newQualityModel(Quality.FLAC), true), null).accepted).toBe(
      true
    );
  });
});
