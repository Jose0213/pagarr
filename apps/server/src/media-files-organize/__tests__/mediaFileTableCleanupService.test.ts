import { describe, expect, it, vi } from "vitest";
import { MediaFileTableCleanupService } from "../mediaFileTableCleanupService.js";
import { DeleteMediaFileReason, type BookFile, type MediaFileServiceLike } from "../types.js";

/**
 * New test covering NzbDrone.Core.Test/MediaFiles/
 * MediaFileTableCleanupServiceFixture's intent: files present in the DB but
 * missing from the on-disk listing get deleted with
 * DeleteMediaFileReason.MissingFromDisk; files still on disk are untouched.
 */
function makeBookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    id: 0,
    path: "",
    size: 0,
    modified: new Date().toISOString(),
    dateAdded: new Date().toISOString(),
    originalFilePath: null,
    sceneName: null,
    releaseGroup: null,
    quality: { quality: { id: 10 } },
    indexerFlags: 0,
    mediaInfo: null,
    editionId: 0,
    calibreId: 0,
    part: 1,
    partCount: 1,
    ...overrides,
  };
}

describe("MediaFileTableCleanupService", () => {
  it("deletes DB rows for files no longer present on disk, keeping the rest", () => {
    const stillPresent = makeBookFile({ id: 1, path: "/library/author/book1.mp3" });
    const missing = makeBookFile({ id: 2, path: "/library/author/book2.mp3" });

    const deleteMany = vi.fn();
    const mediaFileService: MediaFileServiceLike = {
      getFilesByAuthor: vi.fn(() => []),
      getFilesByBook: vi.fn(() => []),
      getFilesWithBasePath: vi.fn(() => [stillPresent, missing]),
      get: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany,
      addMany: vi.fn(),
    };

    const service = new MediaFileTableCleanupService(mediaFileService);
    service.clean("/library/author", ["/library/author/book1.mp3"]);

    expect(deleteMany).toHaveBeenCalledWith([missing], DeleteMediaFileReason.MissingFromDisk);
  });

  it("does not delete anything when every DB file is still on disk", () => {
    const present = makeBookFile({ id: 1, path: "/library/author/book1.mp3" });

    const deleteMany = vi.fn();
    const mediaFileService: MediaFileServiceLike = {
      getFilesByAuthor: vi.fn(() => []),
      getFilesByBook: vi.fn(() => []),
      getFilesWithBasePath: vi.fn(() => [present]),
      get: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany,
      addMany: vi.fn(),
    };

    const service = new MediaFileTableCleanupService(mediaFileService);
    service.clean("/library/author", ["/library/author/book1.mp3"]);

    expect(deleteMany).toHaveBeenCalledWith([], DeleteMediaFileReason.MissingFromDisk);
  });
});
