import { describe, expect, it } from "vitest";
import { MediaFileService } from "../mediaFileService.js";
import { FilterFilesType } from "../filterFilesType.js";
import { newBookFile, type BookFile } from "../bookFile.js";
import { NullMediaFilesEventAggregator } from "../events.js";
import type { FileInfoLike } from "../mediaFileDiskProvider.js";
import type { MediaFileRepository } from "../mediaFileRepository.js";

/**
 * Translated from
 * NzbDrone.Core.Test/MediaFiles/MediaFileServiceTests/FilterFixture.cs.
 * The C# fixture backs `FilterUnchangedFiles` with a real filesystem
 * fake (System.IO.Abstractions.TestingHelpers) plus a mocked
 * `IMediaFileRepository.GetFileWithPath(List<string>)`. This port takes
 * the same shape: `FileInfoLike[]` built directly (no real disk I/O
 * needed -- `filterUnchangedFiles` only reads the passed-in FileInfoLike
 * fields) and a fake repository whose `getFileWithPathList` returns a
 * fixed list, matching the C# mock setup 1:1.
 *
 * The OS-conditional case-sensitivity tests (`WindowsOnly`/`PosixOnly`)
 * are NOT translated -- this port's `getFileWithPathList` path-matching
 * comes from `root-folders/path-utils.ts`'s `pathEquals` (already has its
 * own dedicated test coverage for that OS-aware behavior); duplicating
 * platform-conditional assertions here would just be retesting that file.
 *
 * DEVIATION for the Matched-filter "edition populated" gate: the real C#
 * predicate is `DbFile.Edition == null || (Edition.IsLoaded &&
 * Edition.Value != null)` -- a `LazyLoaded<Edition>` field that can be
 * the bare C# `null` (the field itself unset -- treated as "matched",
 * first OR branch), OR a non-null wrapper around either a real `Edition`
 * (loaded+matched) or `null` (loaded+unmatched, what the C# fixture's
 * `Edition = new LazyLoaded<Edition>(null)` constructs). This port's
 * `BookFile.edition` (books/models.ts convention -- see that file's doc
 * comment) has no LazyLoaded wrapper, so it can only represent two states
 * (`undefined` or a real `Edition`), not three. In PRACTICE every
 * `BookFile` this service ever sees comes from `MediaFileRepository`'s
 * own join-based queries (see mediaFileRepository.ts's `getFileWithPathList`),
 * which always populate `.edition` when a matching Editions row exists
 * and leave it `undefined` only when the join found none -- i.e. real
 * repository data's `.edition === undefined` always means "unmatched",
 * never the C# fixture's synthetic "field itself is null" case (that
 * case is a test-only hand-constructed `BookFile`, not something the
 * real repository ever produces). So `knownFile()` below defaults to a
 * populated `.edition` (the normal "matched" case for repository-sourced
 * data); only the dedicated unmatched test leaves it `undefined`.
 */

const LAST_WRITE = "2019-01-01T00:00:00.000Z";

function givenFiles(paths: string[], size = 0): FileInfoLike[] {
  return paths.map((p) => ({
    fullName: p,
    name: p.split("/").pop() ?? p,
    length: size,
    lastWriteTimeUtc: LAST_WRITE,
  }));
}

function fakeRepo(knownFiles: BookFile[]): MediaFileRepository {
  return {
    getFileWithPathList: () => knownFiles,
  } as unknown as MediaFileRepository;
}

function knownFile(path: string, overrides: Partial<BookFile> = {}): BookFile {
  return {
    ...newBookFile(),
    path,
    modified: LAST_WRITE,
    edition: { id: 1 } as unknown as BookFile["edition"],
    ...overrides,
  };
}

describe.each([FilterFilesType.Known, FilterFilesType.Matched])(
  "MediaFileService.filterUnchangedFiles (%s)",
  (filter) => {
    it("returns all files if no existing files are known", () => {
      const files = givenFiles(["C:/file1.avi", "C:/file2.avi", "C:/file3.avi"]);
      const service = new MediaFileService(fakeRepo([]), new NullMediaFilesEventAggregator());

      expect(service.filterUnchangedFiles(files, filter)).toEqual(files);
    });

    it("returns nothing if all files exist unchanged", () => {
      const files = givenFiles(["C:/file1.avi", "C:/file2.avi", "C:/file3.avi"]);
      const known = files.map((f) => knownFile(f.fullName));
      const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

      expect(service.filterUnchangedFiles(files, filter)).toEqual([]);
    });

    it("does not return existing (unchanged) files, keeps the rest", () => {
      const files = givenFiles(["C:/file1.avi", "C:/file2.avi", "C:/file3.avi"]);
      const known = [knownFile("C:/file2.avi")];
      const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

      const result = service.filterUnchangedFiles(files, filter);
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.fullName)).not.toContain("C:/file2.avi");
    });

    it("does not return an existing file if its size is unchanged", () => {
      const files = givenFiles(["C:/file1.avi", "C:/file2.avi", "C:/file3.avi"], 10);
      const known = [knownFile("C:/file2.avi", { size: 10 })];
      const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

      const result = service.filterUnchangedFiles(files, filter);
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.fullName)).not.toContain("C:/file2.avi");
    });

    it("returns an existing file if its size changed", () => {
      const files: FileInfoLike[] = [
        { fullName: "C:/file1.avi", name: "file1.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
        { fullName: "C:/file2.avi", name: "file2.avi", length: 11, lastWriteTimeUtc: LAST_WRITE },
        { fullName: "C:/file3.avi", name: "file3.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
      ];
      const known = [knownFile("C:/file2.avi", { size: 10 })];
      const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

      const result = service.filterUnchangedFiles(files, filter);
      expect(result).toHaveLength(3);
      expect(result.map((f) => f.fullName)).toContain("C:/file2.avi");
    });
  }
);

describe("MediaFileService.filterUnchangedFiles -- Matched-specific edition gate", () => {
  it("Matched: returns an existing file if it's unmatched (no edition populated)", () => {
    const files: FileInfoLike[] = [
      { fullName: "C:/file1.avi", name: "file1.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
      { fullName: "C:/file2.avi", name: "file2.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
      { fullName: "C:/file3.avi", name: "file3.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
    ];
    const known = [knownFile("C:/file2.avi", { size: 10, edition: undefined })];
    const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

    const result = service.filterUnchangedFiles(files, FilterFilesType.Matched);
    expect(result).toHaveLength(3);
    expect(result.map((f) => f.fullName)).toContain("C:/file2.avi");
  });

  it("Matched: does not return an existing file if it's matched (edition populated)", () => {
    const files: FileInfoLike[] = [
      { fullName: "C:/file1.avi", name: "file1.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
      { fullName: "C:/file2.avi", name: "file2.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
      { fullName: "C:/file3.avi", name: "file3.avi", length: 10, lastWriteTimeUtc: LAST_WRITE },
    ];
    const known = [
      knownFile("C:/file2.avi", {
        size: 10,
        edition: { id: 1 } as unknown as BookFile["edition"],
      }),
    ];
    const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

    const result = service.filterUnchangedFiles(files, FilterFilesType.Matched);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.fullName)).not.toContain("C:/file2.avi");
  });
});

describe("MediaFileService.filterUnchangedFiles -- None", () => {
  it("returns all files unfiltered regardless of known files", () => {
    const files = givenFiles(["C:/file1.avi"]);
    const known = files.map((f) => knownFile(f.fullName));
    const service = new MediaFileService(fakeRepo(known), new NullMediaFilesEventAggregator());

    expect(service.filterUnchangedFiles(files, FilterFilesType.None)).toEqual(files);
  });

  it("throws for an unrecognised filter value, matching the C# source's ArgumentException", () => {
    const files = givenFiles(["C:/file1.avi"]);
    const service = new MediaFileService(
      fakeRepo([knownFile("C:/file1.avi")]),
      new NullMediaFilesEventAggregator()
    );

    expect(() => service.filterUnchangedFiles(files, "Bogus" as FilterFilesType)).toThrow(
      "Unrecognised value of FilterFilesType filter"
    );
  });
});
