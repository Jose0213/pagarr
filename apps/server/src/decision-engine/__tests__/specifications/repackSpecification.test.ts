import { describe, expect, it, vi } from "vitest";
import { RepackSpecification } from "../../specifications/repackSpecification.js";
import { UpgradableSpecification } from "../../specifications/upgradableSpecification.js";
import type { IConfigService } from "../../../config/configService.js";
import type { BookFile, MediaFileServiceLike } from "../../mediaFile.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Revision } from "../../../qualities/revision.js";
import { makeBook, makeParsedBookInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RepackSpecificationFixture.cs. */
describe("RepackSpecification", () => {
  function makeMediaFileService(files: BookFile[]): MediaFileServiceLike {
    return { getFilesByBook: vi.fn(() => files) };
  }

  function makeFiles(count: number, overrides: Partial<BookFile> = {}): BookFile[] {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      path: `/file${i}`,
      quality: newQualityModel(Quality.FLAC),
      releaseGroup: null,
      dateAdded: new Date().toISOString(),
      ...overrides,
    }));
  }

  function makeSubject(
    files: BookFile[],
    downloadPropersAndRepacks: IConfigService["downloadPropersAndRepacks"] = "PreferAndUpgrade"
  ) {
    const upgradable = new UpgradableSpecification({ downloadPropersAndRepacks } as IConfigService);
    return new RepackSpecification(makeMediaFileService(files), upgradable, {
      downloadPropersAndRepacks,
    } as IConfigService);
  }

  function buildRemoteBook(
    quality = newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: false })),
    releaseGroup: string | null = "Readarr"
  ) {
    return makeRemoteBook({
      parsedBookInfo: makeParsedBookInfo({ quality, releaseGroup }),
      books: [makeBook({ id: 1 })],
    });
  }

  it("should_return_true_if_it_is_not_a_repack", () => {
    const subject = makeSubject(makeFiles(3));
    const remoteBook = buildRemoteBook();

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_there_are_is_no_track_files", () => {
    const subject = makeSubject([]);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_is_a_repack_for_a_different_quality", () => {
    const files = makeFiles(3, { releaseGroup: "Readarr", quality: newQualityModel(Quality.MP3) });
    const subject = makeSubject(files);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_is_a_repack_for_all_existing_files", () => {
    const files = makeFiles(3, {
      releaseGroup: "Readarr",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_false_if_is_a_repack_for_some_but_not_all_trackfiles", () => {
    const files = makeFiles(3, {
      releaseGroup: "Readarr",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    files[0]!.releaseGroup = "NotReadarr";
    const subject = makeSubject(files);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_false_if_is_a_repack_for_different_group", () => {
    const files = makeFiles(3, {
      releaseGroup: "NotReadarr",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_false_if_release_group_for_existing_file_is_unknown", () => {
    const files = makeFiles(3, {
      releaseGroup: "",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_false_if_release_group_for_release_is_unknown", () => {
    const files = makeFiles(3, {
      releaseGroup: "Readarr",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files);
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true })),
      null
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_true_when_repacks_are_not_preferred", () => {
    const files = makeFiles(3, {
      releaseGroup: "",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files, "DoNotPrefer");
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_when_repack_but_auto_download_repacks_is_true", () => {
    const files = makeFiles(3, {
      releaseGroup: "Readarr",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files, "PreferAndUpgrade");
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_false_when_repack_but_auto_download_repacks_is_false", () => {
    const files = makeFiles(3, {
      releaseGroup: "Readarr",
      quality: newQualityModel(Quality.FLAC, new Revision({ version: 1 })),
    });
    const subject = makeSubject(files, "DoNotUpgrade");
    const remoteBook = buildRemoteBook(
      newQualityModel(Quality.FLAC, new Revision({ version: 2, isRepack: true }))
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });
});
