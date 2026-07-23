import { describe, expect, it, vi } from "vitest";
import {
  DelaySpecification,
  type PendingReleaseServiceLike,
} from "../../../specifications/rssSync/delaySpecification.js";
import type { IUpgradableSpecification } from "../../../specifications/upgradableSpecification.js";
import {
  newDelayProfile,
  DownloadProtocol as DelayProtocol,
} from "../../../../profiles/delay/delayProfile.js";
import type { DelayProfileService } from "../../../../profiles/delay/delayProfileService.js";
import type { BookFile, MediaFileServiceLike } from "../../../mediaFile.js";
import { DownloadProtocol, type BookSearchCriteria } from "../../../remoteBook.js";
import { newQualityItem } from "../../../../profiles/qualities/qualityProfileQualityItem.js";
import { Quality } from "../../../../qualities/quality.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Revision } from "../../../../qualities/revision.js";
import {
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeReleaseInfo,
  makeRemoteBook,
} from "../../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RssSync/DelaySpecificationFixture.cs. */
describe("DelaySpecification", () => {
  function makeUpgradable(
    overrides: Partial<IUpgradableSpecification> = {}
  ): IUpgradableSpecification {
    return {
      isUpgradable: vi.fn(() => false),
      qualityCutoffNotMet: vi.fn(() => false),
      cutoffNotMet: vi.fn(() => false),
      isRevisionUpgrade: vi.fn(() => false),
      isUpgradeAllowed: vi.fn(() => false),
      ...overrides,
    };
  }

  function makeSubject(
    delayProfileOverrides: Partial<ReturnType<typeof newDelayProfile>>,
    files: BookFile[] = [],
    upgradable: IUpgradableSpecification = makeUpgradable(),
    pendingReleaseService: PendingReleaseServiceLike = { oldestPendingRelease: vi.fn(() => null) }
  ) {
    const delayProfile = newDelayProfile({
      preferredProtocol: DelayProtocol.Usenet,
      ...delayProfileOverrides,
    });
    const delayProfileService = {
      bestForTags: vi.fn(() => delayProfile),
    } as unknown as DelayProfileService;
    const mediaFileService: MediaFileServiceLike = { getFilesByBook: vi.fn(() => files) };

    return new DelaySpecification(
      pendingReleaseService,
      upgradable,
      delayProfileService,
      mediaFileService
    );
  }

  function buildRemoteBook() {
    const profile = makeQualityProfile({
      cutoff: Quality.AZW3.id,
      items: [
        newQualityItem({ quality: Quality.PDF, allowed: true }),
        newQualityItem({ quality: Quality.AZW3, allowed: true }),
        newQualityItem({ quality: Quality.MP3, allowed: true }),
      ],
    });
    const author = makeAuthor({}, profile);

    return makeRemoteBook({
      author,
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.Unknown) }),
      release: makeReleaseInfo({ downloadProtocol: DownloadProtocol.Usenet }),
      books: [makeBook({ id: 1 })],
    });
  }

  function bookSearchCriteria(userInvokedSearch = false): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: false,
      userInvokedSearch,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
      bookTitle: "",
      bookYear: 0,
    };
  }

  it("should_be_true_when_user_invoked_search", () => {
    const subject = makeSubject({});
    expect(subject.isSatisfiedBy(buildRemoteBook(), bookSearchCriteria(true)).accepted).toBe(true);
  });

  it("should_be_false_when_system_invoked_search_and_release_is_younger_than_delay", () => {
    const subject = makeSubject({ usenetDelay: 720 });
    const remoteBook = buildRemoteBook();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.MOBI);
    remoteBook.release.publishDate = new Date().toISOString();

    expect(subject.isSatisfiedBy(remoteBook, bookSearchCriteria(false)).accepted).toBe(false);
  });

  it("should_be_true_when_profile_does_not_have_a_delay", () => {
    const subject = makeSubject({ usenetDelay: 0 });
    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_be_false_when_quality_is_last_allowed_in_profile_and_bypass_disabled", () => {
    const subject = makeSubject({ usenetDelay: 720 });
    const remoteBook = buildRemoteBook();
    remoteBook.release.publishDate = new Date().toISOString();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.MP3);

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_true_when_quality_is_last_allowed_in_profile_and_bypass_enabled", () => {
    const subject = makeSubject({ usenetDelay: 720, bypassIfHighestQuality: true });
    const remoteBook = buildRemoteBook();
    remoteBook.release.publishDate = new Date().toISOString();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.MP3);

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_true_when_release_is_older_than_delay", () => {
    const subject = makeSubject({ usenetDelay: 60 });
    const remoteBook = buildRemoteBook();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.MOBI);
    remoteBook.release.publishDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_false_when_release_is_younger_than_delay", () => {
    const subject = makeSubject({ usenetDelay: 720 });
    const remoteBook = buildRemoteBook();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.MOBI);
    remoteBook.release.publishDate = new Date().toISOString();

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_true_when_release_is_a_proper_for_existing_book", () => {
    const existingFile: BookFile = {
      id: 1,
      path: "/f",
      quality: newQualityModel(Quality.MP3),
      releaseGroup: null,
      dateAdded: new Date().toISOString(),
    };
    const upgradable = makeUpgradable({ isRevisionUpgrade: vi.fn(() => true) });
    const subject = makeSubject({ usenetDelay: 720 }, [existingFile], upgradable);

    const remoteBook = buildRemoteBook();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.MP3, new Revision({ version: 2 }));
    remoteBook.release.publishDate = new Date().toISOString();

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_false_when_release_is_proper_for_existing_book_of_different_quality", () => {
    const existingFile: BookFile = {
      id: 1,
      path: "/f",
      quality: newQualityModel(Quality.PDF),
      releaseGroup: null,
      dateAdded: new Date().toISOString(),
    };
    const subject = makeSubject({ usenetDelay: 720 }, [existingFile]);

    const remoteBook = buildRemoteBook();
    remoteBook.parsedBookInfo.quality = newQualityModel(Quality.AZW3, new Revision({ version: 2 }));
    remoteBook.release.publishDate = new Date().toISOString();

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_false_when_custom_format_score_is_above_minimum_but_bypass_disabled", () => {
    const subject = makeSubject({ usenetDelay: 720, minimumCustomFormatScore: 50 });
    const remoteBook = buildRemoteBook();
    remoteBook.release.publishDate = new Date().toISOString();
    remoteBook.customFormatScore = 100;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_false_when_bypass_enabled_but_score_is_under_minimum", () => {
    const subject = makeSubject({
      usenetDelay: 720,
      bypassIfAboveCustomFormatScore: true,
      minimumCustomFormatScore: 50,
    });
    const remoteBook = buildRemoteBook();
    remoteBook.release.publishDate = new Date().toISOString();
    remoteBook.customFormatScore = 5;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_true_when_custom_format_score_is_above_minimum_and_bypass_enabled", () => {
    const subject = makeSubject({
      usenetDelay: 720,
      bypassIfAboveCustomFormatScore: true,
      minimumCustomFormatScore: 50,
    });
    const remoteBook = buildRemoteBook();
    remoteBook.release.publishDate = new Date().toISOString();
    remoteBook.customFormatScore = 100;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });
});
