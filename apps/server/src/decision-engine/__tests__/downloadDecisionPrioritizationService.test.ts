import { beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadDecisionPriorizationService } from "../downloadDecisionPrioritizationService.js";
import { DownloadDecision } from "../downloadDecision.js";
import { DownloadProtocol, type RemoteBook, type TorrentInfo } from "../remoteBook.js";
import type { IConfigService } from "../../config/configService.js";
import {
  newDelayProfile,
  DownloadProtocol as DelayProtocol,
} from "../../profiles/delay/delayProfile.js";
import type { DelayProfileService } from "../../profiles/delay/delayProfileService.js";
import { Quality } from "../../qualities/quality.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { Revision } from "../../qualities/revision.js";
import {
  getDefaultQualities,
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeQualityProfile,
  makeReleaseInfo,
  makeRemoteBook,
} from "./testFixtures.js";

const MB = 1024 * 1024;

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/PrioritizeDownloadDecisionFixture.cs. */
describe("DownloadDecisionPriorizationService.prioritizeDecisions", () => {
  let preferredProtocol: DelayProtocol;
  let downloadPropersAndRepacks: IConfigService["downloadPropersAndRepacks"];

  function makeSubject(): DownloadDecisionPriorizationService {
    const configService = { downloadPropersAndRepacks } as IConfigService;
    const delayProfileService = {
      bestForTags: vi.fn(() => newDelayProfile({ preferredProtocol })),
    } as unknown as DelayProfileService;

    return new DownloadDecisionPriorizationService(configService, delayProfileService);
  }

  function givenBook(id: number) {
    return makeBook({ id });
  }

  function givenRemoteBook(
    books: ReturnType<typeof makeBook>[],
    quality: ReturnType<typeof newQualityModel>,
    opts: {
      age?: number;
      size?: number;
      downloadProtocol?: DownloadProtocol;
      indexerPriority?: number;
    } = {}
  ): RemoteBook {
    const {
      age = 0,
      size = 0,
      downloadProtocol = DownloadProtocol.Usenet,
      indexerPriority = 25,
    } = opts;

    const profile = makeQualityProfile({ items: getDefaultQualities() });
    const author = makeAuthor({}, profile);

    return makeRemoteBook({
      author,
      books,
      parsedBookInfo: makeParsedBookInfo({ quality }),
      release: makeReleaseInfo({
        publishDate: new Date(Date.now() - age * 24 * 60 * 60 * 1000).toISOString(),
        size,
        downloadProtocol,
        indexerPriority,
      }),
      downloadAllowed: true,
    });
  }

  beforeEach(() => {
    preferredProtocol = DelayProtocol.Usenet;
    downloadPropersAndRepacks = "PreferAndUpgrade";
  });

  it("should_put_reals_before_non_reals", () => {
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.MP3, new Revision({ version: 1, real: 0 }))
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.MP3, new Revision({ version: 1, real: 1 }))
    );

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.real).toBe(1);
  });

  it("should_put_propers_before_non_propers", () => {
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.MP3, new Revision({ version: 1 }))
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.MP3, new Revision({ version: 2 }))
    );

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.version).toBe(2);
  });

  it("should_order_by_age_then_largest_rounded_to_200mb", () => {
    const remoteBookSd = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      size: 100 * MB,
      age: 1,
    });
    const remoteBookHdSmallOld = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      size: 1200 * MB,
      age: 1000,
    });
    const remoteBookSmallYoung = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      size: 1250 * MB,
      age: 10,
    });
    const remoteBookHdLargeYoung = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      size: 3000 * MB,
      age: 1,
    });

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBookSd),
      new DownloadDecision(remoteBookHdSmallOld),
      new DownloadDecision(remoteBookSmallYoung),
      new DownloadDecision(remoteBookHdLargeYoung),
    ]);

    expect(result[0]!.remoteBook).toBe(remoteBookHdLargeYoung);
  });

  it("should_order_by_youngest", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), { age: 10 });
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), { age: 5 });

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook).toBe(remoteBook2);
  });

  it("should_not_throw_if_no_books_are_found", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      size: 500 * MB,
    });
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      size: 500 * MB,
    });
    remoteBook1.books = [];

    const subject = makeSubject();
    expect(() =>
      subject.prioritizeDecisions([
        new DownloadDecision(remoteBook1),
        new DownloadDecision(remoteBook2),
      ])
    ).not.toThrow();
  });

  it("should_put_usenet_above_torrent_when_usenet_is_preferred", () => {
    preferredProtocol = DelayProtocol.Usenet;
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      downloadProtocol: DownloadProtocol.Torrent,
    });
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      downloadProtocol: DownloadProtocol.Usenet,
    });

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.release.downloadProtocol).toBe(DownloadProtocol.Usenet);
  });

  it("should_put_torrent_above_usenet_when_torrent_is_preferred", () => {
    preferredProtocol = DelayProtocol.Torrent;
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      downloadProtocol: DownloadProtocol.Torrent,
    });
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      downloadProtocol: DownloadProtocol.Usenet,
    });

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.release.downloadProtocol).toBe(DownloadProtocol.Torrent);
  });

  it("should_prefer_discography_pack_above_single_book", () => {
    const remoteBook1 = givenRemoteBook(
      [givenBook(1), givenBook(2)],
      newQualityModel(Quality.FLAC)
    );
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.FLAC));
    remoteBook1.parsedBookInfo.discography = true;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.discography).toBe(true);
  });

  it("should_prefer_quality_over_discography_pack", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1), givenBook(2)], newQualityModel(Quality.MP3));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.FLAC));
    remoteBook1.parsedBookInfo.discography = true;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.discography).toBe(false);
  });

  it("should_prefer_single_book_over_multi_book", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1), givenBook(2)], newQualityModel(Quality.MP3));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.books.length).toBe(remoteBook2.books.length);
  });

  it("should_prefer_releases_with_more_seeders", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));

    const torrentInfo1: TorrentInfo = {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, size: 0 }),
      seeders: 10,
      peers: null,
    };
    const torrentInfo2: TorrentInfo = { ...torrentInfo1, seeders: 100 };

    remoteBook1.release = torrentInfo1;
    remoteBook2.release = torrentInfo2;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect((result[0]!.remoteBook.release as TorrentInfo).seeders).toBe(100);
  });

  it("should_prefer_releases_with_more_peers_given_equal_number_of_seeds", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));

    const torrentInfo1: TorrentInfo = {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, size: 0 }),
      seeders: 10,
      peers: 10,
    };
    const torrentInfo2: TorrentInfo = { ...torrentInfo1, peers: 100 };

    remoteBook1.release = torrentInfo1;
    remoteBook2.release = torrentInfo2;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect((result[0]!.remoteBook.release as TorrentInfo).peers).toBe(100);
  });

  it("should_prefer_releases_with_more_peers_no_seeds", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));

    const torrentInfo1: TorrentInfo = {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, size: 0 }),
      seeders: 0,
      peers: 10,
    };
    const torrentInfo2: TorrentInfo = { ...torrentInfo1, seeders: 0, peers: 100 };

    remoteBook1.release = torrentInfo1;
    remoteBook2.release = torrentInfo2;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect((result[0]!.remoteBook.release as TorrentInfo).peers).toBe(100);
  });

  it("should_prefer_first_release_if_age_and_size_are_too_similar", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      age: 100,
      size: 200 * MB,
    });
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3), {
      age: 150,
      size: 250 * MB,
    });

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.release).toBe(remoteBook1.release);
  });

  it("should_prefer_quality_over_the_number_of_peers", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.MP3));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.AZW3));

    const torrentInfo1: TorrentInfo = {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, size: 250 * MB }),
      seeders: 100,
      peers: 10,
    };
    const torrentInfo2: TorrentInfo = { ...torrentInfo1, seeders: 1100 };

    remoteBook1.release = torrentInfo1;
    remoteBook2.release = torrentInfo2;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    // MP3 (remoteBook1) outranks AZW3 (remoteBook2) in getDefaultQualities()'s
    // order ([Unknown, MOBI, EPUB, AZW3, MP3, FLAC] -- later = more preferred),
    // so quality wins over torrentInfo2's far higher seeder count, matching
    // the real C# fixture's own expectation (`Should().Be(torrentInfo1)`).
    expect(result[0]!.remoteBook.release).toBe(torrentInfo1);
  });

  it("should_prefer_higher_score_over_lower_score", () => {
    const remoteBook1 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.FLAC));
    const remoteBook2 = givenRemoteBook([givenBook(1)], newQualityModel(Quality.FLAC));
    remoteBook1.customFormatScore = 10;
    remoteBook2.customFormatScore = 0;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.customFormatScore).toBe(10);
  });

  it("should_prefer_proper_over_score_when_download_propers_is_prefer_and_upgrade", () => {
    downloadPropersAndRepacks = "PreferAndUpgrade";
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 1 }))
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
    );
    remoteBook1.customFormatScore = 10;
    remoteBook2.customFormatScore = 0;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.version).toBe(2);
  });

  it("should_prefer_proper_over_score_when_download_propers_is_do_not_upgrade", () => {
    downloadPropersAndRepacks = "DoNotUpgrade";
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 1 }))
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
    );
    remoteBook1.customFormatScore = 10;
    remoteBook2.customFormatScore = 0;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.version).toBe(2);
  });

  it("should_prefer_score_over_proper_when_download_propers_is_do_not_prefer", () => {
    downloadPropersAndRepacks = "DoNotPrefer";
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 1 }))
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
    );
    remoteBook1.customFormatScore = 10;
    remoteBook2.customFormatScore = 0;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.quality.quality.id).toBe(Quality.FLAC.id);
    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.version).toBe(1);
    expect(result[0]!.remoteBook.customFormatScore).toBe(10);
  });

  it("sort_download_decisions_based_on_indexer_priority", () => {
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.AZW3, new Revision({ version: 1 })),
      { indexerPriority: 25 }
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.AZW3, new Revision({ version: 1 })),
      { indexerPriority: 50 }
    );
    const remoteBook3 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.AZW3, new Revision({ version: 1 })),
      { indexerPriority: 1 }
    );

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
      new DownloadDecision(remoteBook3),
    ]);

    expect(result[0]!.remoteBook).toBe(remoteBook3);
    expect(result[1]!.remoteBook).toBe(remoteBook1);
    expect(result[2]!.remoteBook).toBe(remoteBook2);
  });

  it("ensure_download_decisions_indexer_priority_is_not_perfered_over_quality", () => {
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.EPUB, new Revision({ version: 1 })),
      { indexerPriority: 25 }
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.AZW3, new Revision({ version: 1 })),
      { indexerPriority: 50 }
    );
    const remoteBook3 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.PDF, new Revision({ version: 1 })),
      { indexerPriority: 1 }
    );
    const remoteBook4 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.AZW3, new Revision({ version: 1 })),
      { indexerPriority: 25 }
    );

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
      new DownloadDecision(remoteBook3),
      new DownloadDecision(remoteBook4),
    ]);

    expect(result[0]!.remoteBook).toBe(remoteBook4);
    expect(result[1]!.remoteBook).toBe(remoteBook2);
    expect(result[2]!.remoteBook).toBe(remoteBook1);
    expect(result[3]!.remoteBook).toBe(remoteBook3);
  });

  it("should_prefer_score_over_real_when_download_propers_is_do_not_prefer", () => {
    downloadPropersAndRepacks = "DoNotPrefer";
    const remoteBook1 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 1, real: 0 }))
    );
    const remoteBook2 = givenRemoteBook(
      [givenBook(1)],
      newQualityModel(Quality.FLAC, new Revision({ version: 1, real: 1 }))
    );
    remoteBook1.customFormatScore = 10;
    remoteBook2.customFormatScore = 0;

    const subject = makeSubject();
    const result = subject.prioritizeDecisions([
      new DownloadDecision(remoteBook1),
      new DownloadDecision(remoteBook2),
    ]);

    expect(result[0]!.remoteBook.parsedBookInfo.quality.quality.id).toBe(Quality.FLAC.id);
    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.version).toBe(1);
    expect(result[0]!.remoteBook.parsedBookInfo.quality.revision.real).toBe(0);
    expect(result[0]!.remoteBook.customFormatScore).toBe(10);
  });
});
