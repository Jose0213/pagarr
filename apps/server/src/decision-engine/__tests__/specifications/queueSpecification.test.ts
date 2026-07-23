import { describe, expect, it, vi } from "vitest";
import { QueueSpecification } from "../../specifications/queueSpecification.js";
import { UpgradableSpecification } from "../../specifications/upgradableSpecification.js";
import type { IConfigService } from "../../../config/configService.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import type { CustomFormatCalculationServiceLike } from "../../mediaFile.js";
import { TrackedDownloadState, type QueueItem, type QueueServiceLike } from "../../queue.js";
import type { RemoteBook } from "../../remoteBook.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Revision } from "../../../qualities/revision.js";
import {
  getDefaultQualities,
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeReleaseInfo,
  makeRemoteBook,
} from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/QueueSpecificationFixture.cs. */
describe("QueueSpecification", () => {
  function makeSubject(
    queue: QueueItem[],
    queuedFormats: CustomFormat[] = [],
    downloadPropersAndRepacks: IConfigService["downloadPropersAndRepacks"] = "PreferAndUpgrade"
  ) {
    const configService = { downloadPropersAndRepacks } as IConfigService;
    const upgradable = new UpgradableSpecification(configService);
    const queueService: QueueServiceLike = { getQueue: vi.fn(() => queue) };
    const formatService: CustomFormatCalculationServiceLike = {
      parseCustomFormatForRemoteBook: vi.fn(() => queuedFormats),
      parseCustomFormatForFile: vi.fn(() => []),
      parseCustomFormatForHistory: vi.fn(() => []),
    };

    return new QueueSpecification(queueService, upgradable, formatService, configService);
  }

  function queueItemFor(
    remoteBook: RemoteBook,
    state = TrackedDownloadState.Downloading
  ): QueueItem {
    return { id: 1, remoteBook, size: 0, trackedDownloadState: state };
  }

  const profile = makeQualityProfile({
    upgradeAllowed: true,
    items: getDefaultQualities(),
    minFormatScore: 0,
  });
  const author = makeAuthor({ id: 1 }, profile);
  const book = makeBook({ id: 1 });
  const otherAuthor = makeAuthor({ id: 2 }, profile);
  const otherBook = makeBook({ id: 2 });

  function subjectRemoteBook(quality = newQualityModel(Quality.MP3)) {
    return makeRemoteBook({
      author,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality }),
      customFormats: [],
    });
  }

  it("should_return_true_when_queue_is_empty", () => {
    const subject = makeSubject([]);
    expect(subject.isSatisfiedBy(subjectRemoteBook(), null).accepted).toBe(true);
  });

  it("should_return_true_when_author_doesnt_match", () => {
    const queuedRemoteBook = makeRemoteBook({ author: otherAuthor, books: [book] });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    expect(subject.isSatisfiedBy(subjectRemoteBook(), null).accepted).toBe(true);
  });

  it("should_return_false_if_everything_is_the_same", () => {
    const cutoffProfile = makeQualityProfile({ ...profile, cutoff: Quality.FLAC.id });
    const cutoffAuthor = makeAuthor({ id: 1 }, cutoffProfile);
    const queuedRemoteBook = makeRemoteBook({
      author: cutoffAuthor,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.MP3) }),
    });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    const remoteBook = subjectRemoteBook();
    remoteBook.author = cutoffAuthor;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_true_when_quality_in_queue_is_lower", () => {
    const cutoffProfile = makeQualityProfile({ ...profile, cutoff: Quality.MP3.id });
    const cutoffAuthor = makeAuthor({ id: 1 }, cutoffProfile);
    const queuedRemoteBook = makeRemoteBook({
      author: cutoffAuthor,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.AZW3) }),
    });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    const remoteBook = subjectRemoteBook();
    remoteBook.author = cutoffAuthor;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_when_book_doesnt_match", () => {
    const queuedRemoteBook = makeRemoteBook({ author, books: [otherBook] });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    expect(subject.isSatisfiedBy(subjectRemoteBook(), null).accepted).toBe(true);
  });

  it("should_return_false_when_qualities_are_the_same", () => {
    const queuedRemoteBook = makeRemoteBook({
      author,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.MP3) }),
    });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    expect(subject.isSatisfiedBy(subjectRemoteBook(), null).accepted).toBe(false);
  });

  it("should_return_false_when_quality_in_queue_is_better", () => {
    const cutoffProfile = makeQualityProfile({ ...profile, cutoff: Quality.FLAC.id });
    const cutoffAuthor = makeAuthor({ id: 1 }, cutoffProfile);
    const queuedRemoteBook = makeRemoteBook({
      author: cutoffAuthor,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.FLAC) }),
    });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    const remoteBook = subjectRemoteBook();
    remoteBook.author = cutoffAuthor;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_false_if_matching_multi_book_is_in_queue", () => {
    const queuedRemoteBook = makeRemoteBook({ author, books: [book, otherBook] });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    expect(subject.isSatisfiedBy(subjectRemoteBook(), null).accepted).toBe(false);
  });

  it("should_return_false_if_multi_book_has_one_book_in_queue", () => {
    const queuedRemoteBook = makeRemoteBook({ author, books: [book] });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    const remoteBook = subjectRemoteBook();
    remoteBook.books = [book, otherBook];

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_false_when_quality_is_better_and_upgrade_allowed_is_false_for_quality_profile", () => {
    const cutoffProfile = makeQualityProfile({
      ...profile,
      cutoff: Quality.FLAC.id,
      upgradeAllowed: false,
    });
    const cutoffAuthor = makeAuthor({ id: 1 }, cutoffProfile);
    const queuedRemoteBook = makeRemoteBook({
      author: cutoffAuthor,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.FLAC) }),
    });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)]);

    const remoteBook = subjectRemoteBook(newQualityModel(Quality.FLAC));
    remoteBook.author = cutoffAuthor;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_true_if_everything_is_the_same_for_failed_pending", () => {
    const cutoffProfile = makeQualityProfile({ ...profile, cutoff: Quality.FLAC.id });
    const cutoffAuthor = makeAuthor({ id: 1 }, cutoffProfile);
    const queuedRemoteBook = makeRemoteBook({
      author: cutoffAuthor,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.MP3) }),
    });
    const subject = makeSubject([
      queueItemFor(queuedRemoteBook, TrackedDownloadState.DownloadFailedPending),
    ]);

    const remoteBook = subjectRemoteBook();
    remoteBook.author = cutoffAuthor;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_false_if_same_quality_non_proper_in_queue_and_download_propers_is_do_not_upgrade", () => {
    const cutoffProfile = makeQualityProfile({ ...profile, cutoff: Quality.FLAC.id });
    const cutoffAuthor = makeAuthor({ id: 1 }, cutoffProfile);
    const queuedRemoteBook = makeRemoteBook({
      author: cutoffAuthor,
      books: [book],
      parsedBookInfo: makeParsedBookInfo({ quality: newQualityModel(Quality.FLAC) }),
    });
    const subject = makeSubject([queueItemFor(queuedRemoteBook)], [], "DoNotUpgrade");

    const remoteBook = subjectRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
    );
    remoteBook.author = cutoffAuthor;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });
});
