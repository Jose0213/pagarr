import { describe, expect, it, vi } from "vitest";
import { HistorySpecification } from "../../../specifications/rssSync/historySpecification.js";
import { UpgradableSpecification } from "../../../specifications/upgradableSpecification.js";
import type { IConfigService } from "../../../../config/configService.js";
import {
  EntityHistoryEventType,
  type EntityHistoryRecord,
  type HistoryServiceLike,
} from "../../../history.js";
import type { CustomFormatCalculationServiceLike } from "../../../mediaFile.js";
import type { BookSearchCriteria } from "../../../remoteBook.js";
import { Quality } from "../../../../qualities/quality.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Revision } from "../../../../qualities/revision.js";
import {
  getDefaultQualities,
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeRemoteBook,
} from "../../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RssSync/HistorySpecificationFixture.cs. */
describe("HistorySpecification", () => {
  const FIRST_BOOK_ID = 1;
  const SECOND_BOOK_ID = 2;

  let upgradableQuality: ReturnType<typeof newQualityModel>;
  let notUpgradableQuality: ReturnType<typeof newQualityModel>;

  function makeSubject(
    recordsByBook: Record<number, EntityHistoryRecord | null>,
    cdhEnabled = true
  ): HistorySpecification {
    const configService = {
      enableCompletedDownloadHandling: cdhEnabled,
      downloadPropersAndRepacks: "PreferAndUpgrade",
    } as IConfigService;
    const upgradable = new UpgradableSpecification(configService);
    const historyService: HistoryServiceLike = {
      mostRecentForBook: vi.fn((bookId: number) => recordsByBook[bookId] ?? null),
      getByBook: vi.fn(() => []),
    };
    const formatService: CustomFormatCalculationServiceLike = {
      parseCustomFormatForRemoteBook: vi.fn(() => []),
      parseCustomFormatForFile: vi.fn(() => []),
      parseCustomFormatForHistory: vi.fn(() => []),
    };

    return new HistorySpecification(historyService, upgradable, formatService, configService);
  }

  function historyRecord(overrides: Partial<EntityHistoryRecord> = {}): EntityHistoryRecord {
    return {
      id: 1,
      bookId: FIRST_BOOK_ID,
      authorId: 1,
      sourceTitle: "",
      quality: notUpgradableQuality,
      date: new Date().toISOString(),
      eventType: EntityHistoryEventType.Grabbed,
      downloadId: "",
      ...overrides,
    };
  }

  function buildRemoteBook(bookIds: number[]) {
    upgradableQuality = newQualityModel(Quality.MP3, new Revision({ version: 1 }));
    notUpgradableQuality = newQualityModel(Quality.MP3, new Revision({ version: 2 }));

    const profile = makeQualityProfile({
      upgradeAllowed: true,
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
      minFormatScore: 0,
    });
    const author = makeAuthor({}, profile);

    return makeRemoteBook({
      author,
      parsedBookInfo: makeParsedBookInfo({
        quality: newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      }),
      books: bookIds.map((id) => makeBook({ id })),
      customFormats: [],
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

  it("should_return_true_if_it_is_a_search", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({});
    expect(subject.isSatisfiedBy(multi, bookSearchCriteria()).accepted).toBe(true);
  });

  it("should_return_true_if_latest_history_item_is_null", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({});
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(true);
  });

  it("should_return_true_if_latest_history_item_is_not_grabbed", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({ eventType: EntityHistoryEventType.DownloadFailed }),
    });
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(true);
  });

  it("should_return_true_if_latest_history_item_is_older_than_twelve_hours", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({
        date: new Date(Date.now() - 12 * 60 * 60 * 1000 - 1).toISOString(),
        eventType: EntityHistoryEventType.Grabbed,
      }),
    });
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(true);
  });

  it("should_be_upgradable_if_only_book_is_upgradable", () => {
    const single = buildRemoteBook([FIRST_BOOK_ID]);
    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({
        quality: upgradableQuality,
        date: new Date().toISOString(),
      }),
    });
    expect(subject.isSatisfiedBy(single, null).accepted).toBe(true);
  });

  it("should_be_upgradable_if_both_books_are_upgradable", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({ quality: upgradableQuality }),
      [SECOND_BOOK_ID]: historyRecord({ quality: upgradableQuality }),
    });
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(true);
  });

  it("should_not_be_upgradable_if_both_books_are_not_upgradable", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({ quality: notUpgradableQuality }),
      [SECOND_BOOK_ID]: historyRecord({ quality: notUpgradableQuality }),
    });
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });

  it("should_return_false_if_latest_history_item_is_only_one_hour_old", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({
        quality: notUpgradableQuality,
        date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });

  it("should_return_true_if_latest_history_has_a_download_id_and_cdh_is_disabled", () => {
    const multi = buildRemoteBook([FIRST_BOOK_ID, SECOND_BOOK_ID, 3]);
    const subject = makeSubject(
      {
        [FIRST_BOOK_ID]: historyRecord({
          downloadId: "test",
          quality: upgradableQuality,
          date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      },
      false
    );
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(true);
  });

  it("should_not_be_upgradable_if_book_is_of_same_quality_as_existing", () => {
    const single = buildRemoteBook([FIRST_BOOK_ID]);
    single.author.qualityProfile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
    });
    single.parsedBookInfo.quality = newQualityModel(Quality.MP3, new Revision({ version: 1 }));

    const subject = makeSubject({
      [FIRST_BOOK_ID]: historyRecord({
        quality: newQualityModel(Quality.MP3, new Revision({ version: 1 })),
      }),
    });

    expect(subject.isSatisfiedBy(single, null).accepted).toBe(false);
  });
});
