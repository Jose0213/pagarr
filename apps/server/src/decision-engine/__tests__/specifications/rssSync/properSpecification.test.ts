import { describe, expect, it, vi } from "vitest";
import { ProperSpecification } from "../../../specifications/rssSync/properSpecification.js";
import { UpgradableSpecification } from "../../../specifications/upgradableSpecification.js";
import type { IConfigService } from "../../../../config/configService.js";
import type { BookFile, MediaFileServiceLike } from "../../../mediaFile.js";
import type { BookSearchCriteria } from "../../../remoteBook.js";
import { Quality } from "../../../../qualities/quality.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Revision } from "../../../../qualities/revision.js";
import {
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeRemoteBook,
} from "../../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RssSync/ProperSpecificationFixture.cs. */
describe("ProperSpecification", () => {
  function daysAgo(days: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return new Date(d.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  function today(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function makeSubject(
    files: BookFile[],
    downloadPropersAndRepacks: IConfigService["downloadPropersAndRepacks"] = "PreferAndUpgrade"
  ) {
    const configService = { downloadPropersAndRepacks } as IConfigService;
    const upgradable = new UpgradableSpecification(configService);
    const mediaFileService: MediaFileServiceLike = { getFilesByBook: vi.fn(() => files) };

    return new ProperSpecification(upgradable, configService, mediaFileService);
  }

  function makeFile(
    quality = newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    dateAdded = new Date().toISOString()
  ): BookFile {
    return { id: 1, path: "/file", quality, releaseGroup: null, dateAdded };
  }

  function buildRemoteBook(bookCount: number) {
    const profile = makeQualityProfile({ cutoff: Quality.FLAC.id });
    const author = makeAuthor({}, profile);
    return makeRemoteBook({
      author,
      parsedBookInfo: makeParsedBookInfo({
        quality: newQualityModel(Quality.MOBI, new Revision({ version: 2 })),
      }),
      books: Array.from({ length: bookCount }, (_, i) => makeBook({ id: i + 1 })),
    });
  }

  function bookSearchCriteria(): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
      bookTitle: "",
      bookYear: 0,
    };
  }

  it("should_return_false_when_trackFile_was_added_more_than_7_days_ago", () => {
    const file = makeFile(newQualityModel(Quality.MOBI, new Revision({ version: 1 })), daysAgo(30));
    const subject = makeSubject([file]);

    expect(subject.isSatisfiedBy(buildRemoteBook(1), null).accepted).toBe(false);
  });

  it("should_return_true_when_trackFile_was_added_more_than_7_days_ago_but_proper_is_for_better_quality", () => {
    const file = makeFile(newQualityModel(Quality.PDF), daysAgo(30));
    const subject = makeSubject([file]);

    expect(subject.isSatisfiedBy(buildRemoteBook(1), null).accepted).toBe(true);
  });

  it("should_return_true_when_trackFile_was_added_more_than_7_days_ago_but_is_for_search", () => {
    const file = makeFile(newQualityModel(Quality.PDF), daysAgo(30));
    const subject = makeSubject([file]);

    expect(subject.isSatisfiedBy(buildRemoteBook(1), bookSearchCriteria()).accepted).toBe(true);
  });

  it("should_return_false_when_proper_but_auto_download_propers_is_false", () => {
    const file = makeFile(newQualityModel(Quality.MOBI, new Revision({ version: 1 })), today());
    const subject = makeSubject([file], "DoNotUpgrade");

    expect(subject.isSatisfiedBy(buildRemoteBook(1), null).accepted).toBe(false);
  });

  it("should_return_true_when_trackFile_was_added_today", () => {
    const file = makeFile(newQualityModel(Quality.MOBI, new Revision({ version: 1 })), today());
    const subject = makeSubject([file], "PreferAndUpgrade");

    expect(subject.isSatisfiedBy(buildRemoteBook(1), null).accepted).toBe(true);
  });

  it("should_return_true_when_propers_are_not_preferred", () => {
    const file = makeFile(newQualityModel(Quality.MOBI, new Revision({ version: 1 })), today());
    const subject = makeSubject([file], "DoNotPrefer");

    expect(subject.isSatisfiedBy(buildRemoteBook(1), null).accepted).toBe(true);
  });
});
