import { describe, expect, it, vi } from "vitest";
import { AlreadyImportedSpecification } from "../../specifications/alreadyImportedSpecification.js";
import type { IConfigService } from "../../../config/configService.js";
import {
  EntityHistoryEventType,
  type EntityHistoryRecord,
  type HistoryServiceLike,
} from "../../history.js";
import type { BookFile, MediaFileServiceLike } from "../../mediaFile.js";
import { DownloadProtocol, type TorrentInfo } from "../../remoteBook.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Revision } from "../../../qualities/revision.js";
import { makeBook, makeParsedBookInfo, makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/AlreadyImportedSpecificationFixture.cs. */
describe("AlreadyImportedSpecification", () => {
  const TITLE = "Some.Author-Some.Book-2018-320kbps-CD-Readarr";
  const mp3 = newQualityModel(Quality.MP3, new Revision({ version: 1 }));
  const flac = newQualityModel(Quality.FLAC, new Revision({ version: 1 }));

  let history: EntityHistoryRecord[];
  let historyService: HistoryServiceLike;
  let mediaFileService: MediaFileServiceLike;
  let configService: IConfigService;
  let firstFile: BookFile;

  function makeSubject(): AlreadyImportedSpecification {
    return new AlreadyImportedSpecification(historyService, configService, mediaFileService);
  }

  function buildRemoteBook() {
    return makeRemoteBook({
      parsedBookInfo: makeParsedBookInfo({ quality: mp3 }),
      books: [makeBook({ id: 1, title: "Some Book" })],
      release: makeReleaseInfo(),
    });
  }

  function historyItem(overrides: Partial<EntityHistoryRecord>): EntityHistoryRecord {
    return {
      id: history.length + 1,
      bookId: 1,
      authorId: 1,
      sourceTitle: TITLE,
      quality: mp3,
      date: new Date().toISOString(),
      eventType: EntityHistoryEventType.Grabbed,
      downloadId: null,
      ...overrides,
    };
  }

  function setUp() {
    history = [];
    firstFile = {
      id: 1,
      path: "/file",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 2 })),
      releaseGroup: null,
      dateAdded: new Date().toISOString(),
    };

    configService = { enableCompletedDownloadHandling: true } as IConfigService;
    historyService = {
      mostRecentForBook: vi.fn(),
      getByBook: vi.fn(() => history),
    };
    mediaFileService = { getFilesByBook: vi.fn(() => [firstFile]) };
  }

  it("should_be_accepted_if_CDH_is_disabled", () => {
    setUp();
    configService = { enableCompletedDownloadHandling: false } as IConfigService;
    const subject = makeSubject();

    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_be_accepted_if_book_does_not_have_a_file", () => {
    setUp();
    mediaFileService = { getFilesByBook: vi.fn(() => []) };
    const subject = makeSubject();

    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_be_accepted_if_book_does_not_have_grabbed_event", () => {
    setUp();
    const subject = makeSubject();

    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_be_accepted_if_book_does_not_have_imported_event", () => {
    setUp();
    history.push(historyItem({ downloadId: "guid-1", eventType: EntityHistoryEventType.Grabbed }));
    const subject = makeSubject();

    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_be_accepted_if_grabbed_and_imported_quality_is_the_same", () => {
    setUp();
    history.push(
      historyItem({ downloadId: "guid-1", quality: mp3, eventType: EntityHistoryEventType.Grabbed })
    );
    history.push(
      historyItem({
        downloadId: "guid-1",
        quality: mp3,
        eventType: EntityHistoryEventType.BookFileImported,
      })
    );
    const subject = makeSubject();

    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_be_rejected_if_grabbed_download_id_matches_release_torrent_hash", () => {
    setUp();
    const downloadId = "GUID-1";
    history.push(
      historyItem({ downloadId, quality: mp3, eventType: EntityHistoryEventType.Grabbed })
    );
    history.push(
      historyItem({ downloadId, quality: flac, eventType: EntityHistoryEventType.BookFileImported })
    );
    const subject = makeSubject();

    const remoteBook = buildRemoteBook();
    remoteBook.release = {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent }),
      seeders: null,
      peers: null,
      infoHash: downloadId,
    } as TorrentInfo;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_accepted_if_release_torrent_hash_is_null", () => {
    setUp();
    const downloadId = "GUID-1";
    history.push(
      historyItem({ downloadId, quality: mp3, eventType: EntityHistoryEventType.Grabbed })
    );
    history.push(
      historyItem({ downloadId, quality: flac, eventType: EntityHistoryEventType.BookFileImported })
    );
    const subject = makeSubject();

    const remoteBook = buildRemoteBook();
    remoteBook.release = {
      ...makeReleaseInfo({
        downloadProtocol: DownloadProtocol.Torrent,
        title: "Some other title entirely",
      }),
      seeders: null,
      peers: null,
      infoHash: null,
    } as TorrentInfo;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_rejected_if_release_title_matches_grabbed_event_source_title", () => {
    setUp();
    const downloadId = "GUID-1";
    history.push(
      historyItem({
        downloadId,
        sourceTitle: TITLE,
        quality: mp3,
        eventType: EntityHistoryEventType.Grabbed,
      })
    );
    history.push(
      historyItem({
        downloadId,
        sourceTitle: TITLE,
        quality: flac,
        eventType: EntityHistoryEventType.BookFileImported,
      })
    );
    const subject = makeSubject();

    const remoteBook = buildRemoteBook();
    remoteBook.release = {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, title: TITLE }),
      seeders: null,
      peers: null,
      infoHash: null,
    } as TorrentInfo;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });
});
