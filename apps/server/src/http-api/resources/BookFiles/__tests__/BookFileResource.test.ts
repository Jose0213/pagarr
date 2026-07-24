import { describe, expect, it, vi } from "vitest";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { Revision } from "../../../../qualities/revision.js";
import { newQualityProfile } from "../../../../profiles/qualities/qualityProfile.js";
import type { Author } from "../../../../books/index.js";
import type { BookFile } from "../../../../media-files-import/bookFile.js";
import { bookFileToResource, bookFileToResourceWithAuthor } from "../BookFileResource.js";

function makeBookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    id: 1,
    path: "/music/author/book/file.mp3",
    size: 1000,
    modified: new Date(0).toISOString(),
    dateAdded: "2024-01-01T00:00:00.000Z",
    originalFilePath: null,
    sceneName: null,
    releaseGroup: null,
    quality: newQualityModel(Quality.MP3, new Revision({ version: 2, real: 1 })),
    indexerFlags: 0,
    mediaInfo: null,
    editionId: 0,
    calibreId: 0,
    part: 0,
    partCount: 0,
    ...overrides,
  };
}

describe("bookFileToResource", () => {
  it("returns null for a null/undefined model", () => {
    expect(bookFileToResource(null)).toBeNull();
    expect(bookFileToResource(undefined)).toBeNull();
  });

  it("maps a plain BookFile without an author", () => {
    const bookFile = makeBookFile({ edition: { bookId: 55 } as never });

    const resource = bookFileToResource(bookFile);

    expect(resource).toMatchObject({
      id: 1,
      authorId: 0,
      bookId: 55,
      path: bookFile.path,
      size: 1000,
      qualityCutoffNotMet: false,
    });
    // MP3 weight 100 + real(1)*10 + version(2) = 112.
    expect(resource!.qualityWeight).toBe(112);
  });

  it("defaults bookId to 0 when no edition is populated", () => {
    const resource = bookFileToResource(makeBookFile());
    expect(resource!.bookId).toBe(0);
  });

  it("qualityWeight is 0 for a null/undefined quality", () => {
    const resource = bookFileToResource(makeBookFile({ quality: undefined as never }));
    expect(resource!.qualityWeight).toBe(0);
  });
});

describe("bookFileToResourceWithAuthor", () => {
  it("returns null for a null/undefined model", () => {
    const author = { id: 1, qualityProfileId: 1 } as Author;
    const profile = newQualityProfile();
    const spec = { qualityCutoffNotMet: vi.fn(() => false) };

    expect(bookFileToResourceWithAuthor(null, author, profile, spec)).toBeNull();
  });

  it("maps authorId, indexerFlags, and delegates qualityCutoffNotMet to the spec", () => {
    const author = { id: 9, qualityProfileId: 3 } as Author;
    const profile = newQualityProfile({ id: 3 });
    const bookFile = makeBookFile({ indexerFlags: 2 as never });
    const spec = { qualityCutoffNotMet: vi.fn(() => true) };

    const resource = bookFileToResourceWithAuthor(bookFile, author, profile, spec);

    expect(resource!.authorId).toBe(9);
    expect(resource!.qualityCutoffNotMet).toBe(true);
    expect(resource!.indexerFlags).toBe(2);
    expect(spec.qualityCutoffNotMet).toHaveBeenCalledWith(profile, bookFile.quality);
  });
});
