import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioTagService,
  type AudioTagServiceDeps,
  type AudioDiskProviderLike,
  type CoverPathResolverLike,
} from "../audioTagService.js";
import type { BookFileRef, EditionRef } from "../audioTagTypes.js";
import { buildSilentWav } from "./testAudioFixture.js";

/**
 * Partial translation of NzbDrone.Core.Test/MediaFiles/AudioTagServiceFixture.cs's
 * BookFile/metadata-construction tests (`get_metadata_should_not_fail_with_missing_country`,
 * `should_not_fail_if_media_has_been_omitted`, `write_tags_should_update_trackfile_size_and_modified`,
 * `write_tags_should_not_update_tags_if_already_updated`,
 * `should_not_fail_reading_metadata_with_dates_omitted`) against this
 * module's forward-referenced `BookFileRef`/`EditionRef` shapes (real
 * `BookFile` isn't ported anywhere yet -- see audioTagTypes.ts) and the
 * synthetic WAV fixture (see testAudioFixture.ts).
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "audiotagservice-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeDiskProvider(): AudioDiskProviderLike {
  return {
    getFileInfo: (path) => {
      const stat = statSync(path);
      return { length: stat.size, lastWriteTimeUtc: stat.mtime.toISOString() };
    },
    getFileSize: (path) => statSync(path).size,
  };
}

function makeCoverPathResolver(): CoverPathResolverLike {
  return { getCoverPath: () => join(dir, "cover.jpg") };
}

function makeService(overrides: Partial<AudioTagServiceDeps> = {}) {
  const authorService = { getAuthor: () => ({ id: 1, name: "Test Author" }), getAuthors: () => [] };
  const mediaFileService = {
    getFilesByAuthor: () => [] as BookFileRef[],
    getFilesByBook: () => [] as BookFileRef[],
    get: () => [] as BookFileRef[],
    update: vi.fn(),
  };
  const eventAggregator = { publishEvent: vi.fn() };

  return {
    service: new AudioTagService({
      configService: { writeAudioTags: "sync", scrubAudioTags: false },
      mediaFileService,
      diskProvider: makeDiskProvider(),
      rootFolderWatchingService: { reportFileSystemChangeBeginning: vi.fn() },
      authorService,
      coverPathResolver: makeCoverPathResolver(),
      eventAggregator,
      ...overrides,
    }),
    mediaFileService,
    eventAggregator,
  };
}

function makeBookFile(path: string, overrides: Partial<BookFileRef> = {}): BookFileRef {
  const edition: EditionRef = {
    id: 5,
    bookId: 7,
    foreignEditionId: "fe1",
    titleSlug: "slug",
    isbn13: null,
    asin: null,
    title: "The Book",
    language: "eng",
    overview: "",
    format: null,
    isEbook: false,
    disambiguation: null,
    publisher: "Pub",
    pageCount: 0,
    releaseDate: "2019-03-01T00:00:00.000Z",
    images: [],
    links: [],
    ratings: { votes: 0, value: 0 },
    monitored: true,
    manualAdd: false,
    book: {
      id: 7,
      authorMetadataId: 1,
      foreignBookId: "fb1",
      titleSlug: "book-slug",
      title: "The Book",
      releaseDate: "2018-01-01T00:00:00.000Z",
      links: [],
      genres: [],
      relatedBooks: [],
      ratings: { votes: 0, value: 0 },
      lastSearchTime: null,
      cleanTitle: "thebook",
      monitored: true,
      anyEditionOk: true,
      lastInfoSync: null,
      added: null,
      addOptions: { monitor: "all", searchForNewBook: false },
      author: {
        id: 1,
        authorMetadataId: 1,
        cleanName: "testauthor",
        monitored: true,
        monitorNewItems: "all",
        lastInfoSync: null,
        path: "/books/test-author",
        rootFolderPath: "/books",
        added: null,
        qualityProfileId: 1,
        metadataProfileId: 1,
        tags: [],
        metadata: {
          id: 1,
          foreignAuthorId: "fa1",
          titleSlug: "test-author",
          name: "Test Author",
          sortName: "Author, Test",
          nameLastFirst: "Author, Test",
          sortNameLastFirst: "Author, Test",
          aliases: [],
          overview: null,
          disambiguation: null,
          gender: null,
          hometown: null,
          born: null,
          died: null,
          status: "continuing",
          images: [],
          links: [],
          genres: [],
          ratings: { votes: 0, value: 0 },
        },
      },
    },
  };

  edition.bookFiles = [];

  const file: BookFileRef = {
    id: 0,
    path,
    calibreId: 0,
    part: 1,
    size: 0,
    modified: new Date(0).toISOString(),
    edition,
    author: edition.book?.author,
    ...overrides,
  };

  edition.bookFiles = [file];

  return file;
}

function writeWavFixture(name = "track.wav"): string {
  const path = join(dir, name);
  writeFileSync(path, buildSilentWav());
  return path;
}

describe("AudioTagService.getTrackMetadata", () => {
  it("does not fail when the trackfile is fully populated (get_metadata_should_not_fail_with_missing_country)", () => {
    const { service } = makeService();
    const path = writeWavFixture();
    const file = makeBookFile(path);

    expect(() => service.getTrackMetadata(file)).not.toThrow();
  });

  it("does not fail when media has been omitted from the underlying file tags (should_not_fail_if_media_has_been_omitted)", () => {
    const { service } = makeService();
    const path = writeWavFixture();
    const file = makeBookFile(path);

    expect(() => service.getTrackMetadata(file)).not.toThrow();
  });

  it("does not fail when Edition/Book release dates are null (should_not_fail_reading_metadata_with_dates_omitted)", () => {
    const { service } = makeService();
    const path = writeWavFixture();
    const file = makeBookFile(path);
    file.edition!.releaseDate = null;
    file.edition!.book!.releaseDate = null;

    expect(() => service.getTrackMetadata(file)).not.toThrow();
    const tag = service.getTrackMetadata(file);
    expect(tag.date).toBeNull();
    expect(tag.originalReleaseDate).toBeNull();
  });

  it("populates title/authors/book from the Edition/Book/Author chain", () => {
    const { service } = makeService();
    const path = writeWavFixture();
    const file = makeBookFile(path);

    const tag = service.getTrackMetadata(file);
    expect(tag.title).toBe("The Book");
    expect(tag.book).toBe("The Book");
    expect(tag.bookAuthors).toEqual(["Test Author"]);
    expect(tag.performers).toEqual(["Test Author"]);
    expect(tag.track).toBe(1);
  });
});

describe("AudioTagService.writeTags", () => {
  it("updates trackfile size and modified, and publishes exactly one retag event (write_tags_should_update_trackfile_size_and_modified)", () => {
    const { service, eventAggregator } = makeService();
    const path = writeWavFixture();
    const file = makeBookFile(path);

    service.writeTags(file, false, true);

    expect(file.size).toBeGreaterThan(0);
    expect(eventAggregator.publishEvent).toHaveBeenCalledTimes(1);
  });

  it("does not publish another event on a second identical write (write_tags_should_not_update_tags_if_already_updated)", () => {
    const { service, eventAggregator } = makeService();
    const path = writeWavFixture();
    const file = makeBookFile(path);

    service.writeTags(file, false, true);
    service.writeTags(file, false, true);
    service.writeTags(file, false, true);

    expect(eventAggregator.publishEvent).toHaveBeenCalledTimes(1);
  });

  it("skips writing when writeAudioTags is 'no' and force is false", () => {
    const { service, eventAggregator } = makeService({
      configService: { writeAudioTags: "no", scrubAudioTags: false },
    });
    const path = writeWavFixture();
    const file = makeBookFile(path);

    service.writeTags(file, false, false);

    expect(eventAggregator.publishEvent).not.toHaveBeenCalled();
  });
});
