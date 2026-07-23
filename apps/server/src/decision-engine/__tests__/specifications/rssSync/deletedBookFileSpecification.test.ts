import { describe, expect, it, vi } from "vitest";
import {
  DeletedBookFileSpecification,
  type DiskProviderLike,
} from "../../../specifications/rssSync/deletedBookFileSpecification.js";
import type { IConfigService } from "../../../../config/configService.js";
import type { BookFile, MediaFileServiceLike } from "../../../mediaFile.js";
import type { SearchCriteriaBase } from "../../../remoteBook.js";
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

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RssSync/DeletedTrackFileSpecificationFixture.cs. */
describe("DeletedBookFileSpecification", () => {
  const firstFile: BookFile = {
    id: 1,
    path: "/My.Author.S01E01.mp3",
    quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    releaseGroup: null,
    dateAdded: new Date().toISOString(),
  };
  const secondFile: BookFile = {
    id: 2,
    path: "/My.Author.S01E02.mp3",
    quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    releaseGroup: null,
    dateAdded: new Date().toISOString(),
  };

  function makeSubject(files: BookFile[], existingPaths: string[] = [], autoUnmonitor = true) {
    const configService = {
      autoUnmonitorPreviouslyDownloadedBooks: autoUnmonitor,
    } as IConfigService;
    const mediaFileService: MediaFileServiceLike = { getFilesByBook: vi.fn(() => files) };
    const diskProvider: DiskProviderLike = {
      fileExists: vi.fn((p: string) => existingPaths.includes(p)),
    };

    return new DeletedBookFileSpecification(diskProvider, configService, mediaFileService);
  }

  function buildRemoteBook(bookIds: number[]) {
    const profile = makeQualityProfile({ cutoff: Quality.FLAC.id });
    const author = makeAuthor({}, profile);
    return makeRemoteBook({
      author,
      parsedBookInfo: makeParsedBookInfo({
        quality: newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      }),
      books: bookIds.map((id) => makeBook({ id })),
    });
  }

  const authorSearchCriteria: SearchCriteriaBase = {
    kind: "author",
    monitoredBooksOnly: false,
    userInvokedSearch: false,
    interactiveSearch: false,
    author: makeAuthor(),
    books: [],
  };

  it("should_return_true_when_unmonitor_deleted_tracks_is_off", () => {
    const subject = makeSubject([firstFile], [], false);
    expect(subject.isSatisfiedBy(buildRemoteBook([1]), null).accepted).toBe(true);
  });

  it("should_return_true_when_searching", () => {
    const subject = makeSubject([firstFile]);
    expect(subject.isSatisfiedBy(buildRemoteBook([1]), authorSearchCriteria).accepted).toBe(true);
  });

  it("should_return_true_if_file_exists", () => {
    const subject = makeSubject([firstFile], [firstFile.path]);
    expect(subject.isSatisfiedBy(buildRemoteBook([1]), null).accepted).toBe(true);
  });

  it("should_return_false_if_file_is_missing", () => {
    const subject = makeSubject([firstFile], []);
    expect(subject.isSatisfiedBy(buildRemoteBook([1]), null).accepted).toBe(false);
  });

  it("should_return_true_if_both_of_multiple_episode_exist", () => {
    const subject = makeSubject([firstFile, secondFile], [firstFile.path, secondFile.path]);
    expect(subject.isSatisfiedBy(buildRemoteBook([1, 2]), null).accepted).toBe(true);
  });

  it("should_return_false_if_one_of_multiple_episode_is_missing", () => {
    const subject = makeSubject([firstFile, secondFile], [firstFile.path]);
    expect(subject.isSatisfiedBy(buildRemoteBook([1, 2]), null).accepted).toBe(false);
  });
});
