import { describe, expect, it } from "vitest";
import { newParsedTrackInfo } from "../../parser/model/parsedTrackInfo.js";
import { newLocalBook, type LocalBook } from "../../parser/model/localBook.js";
import {
  TrackGroupingService,
  isVariousAuthors,
  looksLikeSingleRelease,
} from "../bookImport/identification/trackGroupingService.js";

/**
 * Translated from
 * NzbDrone.Core.Test/MediaFiles/BookImport/Identification/TrackGroupingServiceFixture.cs.
 * The C# fixture's `[Ignore("TODO: fix")]` cases (VA-related, using
 * random-generated author names to probabilistically test grouping) are
 * NOT translated -- they're explicitly disabled/known-flaky in the real
 * upstream test suite, not something this port should newly assert on.
 */

function givenTracks(root: string, author: string, book: string, count: number): LocalBook[] {
  const tracks: LocalBook[] = [];
  for (let i = 0; i < count; i++) {
    const info = newParsedTrackInfo();
    info.authors = [author];
    info.bookTitle = book;
    info.title = `track-${i}`;

    const track = newLocalBook();
    track.fileTrackInfo = info;
    track.path = `${root}/track-${i}`;
    tracks.push(track);
  }
  return tracks;
}

function givenTracksWithNoTags(root: string, count: number): LocalBook[] {
  const tracks: LocalBook[] = [];
  for (let i = 0; i < count; i++) {
    const track = newLocalBook();
    track.fileTrackInfo = newParsedTrackInfo();
    track.path = `${root}/${i}.mp3`;
    tracks.push(track);
  }
  return tracks;
}

describe("TrackGroupingService", () => {
  const subject = new TrackGroupingService();

  it.each([1, 2, 10])("single_author_is_not_various_authors (%i)", (count) => {
    const tracks = givenTracks("C:/music/incoming", "author", "book", count);
    expect(isVariousAuthors(tracks)).toBe(false);
  });

  it("two_authors_is_not_various_authors", () => {
    const dir = "C:/music/incoming";
    const tracks = [
      ...givenTracks(dir, "author1", "book", 10),
      ...givenTracks(dir, "author2", "book", 10),
    ];
    expect(isVariousAuthors(tracks)).toBe(false);
  });

  it.each(["", "Various Authors", "Various", "VA", "Unknown"])(
    "va_author_title_is_various_authors (%s)",
    (author) => {
      const tracks = givenTracks("C:/music/incoming", author, "book", 10);
      expect(isVariousAuthors(tracks)).toBe(true);
    }
  );

  it.each(["Va?!", "Va Va Voom", "V.A. Jr.", "Ca Va"])(
    "va_in_author_name_is_not_various_authors (%s)",
    (author) => {
      const tracks = givenTracks("C:/music/incoming", author, "book", 10);
      expect(isVariousAuthors(tracks)).toBe(false);
    }
  );

  it.each([1, 2, 10])("should_group_single_author_book (%i)", (count) => {
    const tracks = givenTracks("C:/music/incoming", "author", "book", count);
    const output = subject.groupTracks(tracks);

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(true);

    expect(output).toHaveLength(1);
    expect(output[0]!.localBooks).toHaveLength(count);
  });

  it.each(["cd", "disc", "disk"])("should_group_multi_disc_release (%s)", (mediaName) => {
    const tracks = [
      ...givenTracks(`C:/music/incoming/author - book/${mediaName} 1`, "author", "book", 10),
      ...givenTracks(`C:/music/incoming/author - book/${mediaName} 2`, "author", "book", 5),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(true);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(1);
    expect(output[0]!.localBooks).toHaveLength(15);
  });

  it("should_not_group_two_different_books_by_same_author", () => {
    const tracks = [
      ...givenTracks("C:/music/incoming/author - book1", "author", "book1", 10),
      ...givenTracks("C:/music/incoming/author - book2", "author", "book2", 5),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(false);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(2);
    expect(output[0]!.localBooks).toHaveLength(10);
    expect(output[1]!.localBooks).toHaveLength(5);
  });

  it("should_group_books_with_typos", () => {
    const tracks = [
      ...givenTracks(
        "C:/music/incoming/author - book",
        "author",
        "Rastaman Vibration (Remastered)",
        10
      ),
      ...givenTracks(
        "C:/music/incoming/author - book",
        "author",
        "Rastaman Vibration (Remastered",
        5
      ),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(true);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(1);
    expect(output[0]!.localBooks).toHaveLength(15);
  });

  it("should_not_group_two_different_tracks_in_same_directory", () => {
    const tracks = [
      ...givenTracks("C:/music/incoming", "author", "book1", 1),
      ...givenTracks("C:/music/incoming", "author", "book2", 1),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(false);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(2);
    expect(output[0]!.localBooks).toHaveLength(1);
    expect(output[1]!.localBooks).toHaveLength(1);
  });

  it("should_separate_many_books_in_same_directory", () => {
    let tracks: LocalBook[] = [];
    for (let i = 0; i < 100; i++) {
      tracks = tracks.concat(givenTracks("C:/music", `author${i}`, `book${i}`, 10));
    }

    expect(looksLikeSingleRelease(tracks)).toBe(false);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(100);
    expect(new Set(output.map((x) => x.localBooks.length))).toEqual(new Set([10]));
  });

  it("should_separate_two_books_by_different_authors_in_same_directory", () => {
    const tracks = [
      ...givenTracks("C:/music/incoming", "author1", "book1", 10),
      ...givenTracks("C:/music/incoming", "author2", "book2", 5),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(false);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(2);
    expect(output[0]!.localBooks).toHaveLength(10);
    expect(output[1]!.localBooks).toHaveLength(5);
  });

  it("should_not_group_two_books_by_different_authors_with_same_title", () => {
    const tracks = [
      ...givenTracks("C:/music/incoming/book", "author1", "book", 10),
      ...givenTracks("C:/music/incoming/book", "author2", "book", 5),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(false);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(2);
    expect(output[0]!.localBooks).toHaveLength(10);
    expect(output[1]!.localBooks).toHaveLength(5);
  });

  it("should_not_fail_if_all_tags_null", () => {
    const tracks = givenTracksWithNoTags("C:/music/incoming/book", 10);

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(true);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(1);
    expect(output[0]!.localBooks).toHaveLength(10);
  });

  it("should_not_fail_if_some_tags_null", () => {
    const tracks = [
      ...givenTracks("C:/music/incoming/book", "author1", "book", 10),
      ...givenTracksWithNoTags("C:/music/incoming/book", 2),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(true);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(1);
    expect(output[0]!.localBooks).toHaveLength(12);
  });

  it("should_cope_with_one_book_in_subfolder_of_another", () => {
    const tracks = [
      ...givenTracks("C:/music/incoming/book", "author1", "book", 10),
      ...givenTracks("C:/music/incoming/book/anotherbook", "author2", "book2", 10),
    ];

    expect(isVariousAuthors(tracks)).toBe(false);
    expect(looksLikeSingleRelease(tracks)).toBe(false);

    const output = subject.groupTracks(tracks);
    expect(output).toHaveLength(2);
    expect(output[0]!.localBooks).toHaveLength(10);
    expect(output[1]!.localBooks).toHaveLength(10);
  });
});
