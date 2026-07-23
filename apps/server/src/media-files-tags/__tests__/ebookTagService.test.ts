import { describe, expect, it } from "vitest";
import { EbookTagService } from "../ebookTagService.js";
import type { CalibreProxyLike } from "../ebookTagTypes.js";

/**
 * Translated from NzbDrone.Core.Test/MediaFiles/EbookTagServiceFixture.cs
 * (`should_prefer_isbn13`) plus new tests for `getIsbn`'s ISBN-10/13
 * validation and preference-ordering logic (StripIsbn/ValidateIsbn10/
 * ValidateIsbn13 in the C# source), which the original C# fixture doesn't
 * separately cover.
 */

function makeService(): EbookTagService {
  const calibre: CalibreProxyLike = {
    setFields: () => {},
    getBooks: () => [],
  };

  return new EbookTagService({
    authorService: { getAuthor: () => ({ id: 0, name: "" }), getAuthors: () => [] },
    mediaFileService: { getFilesByAuthor: () => [], getFilesByBook: () => [], get: () => [] },
    rootFolderService: { getBestRootFolder: () => undefined },
    configService: { writeBookTags: "no", updateCovers: true, embedMetadata: false },
    calibre,
    canonicalizeLanguage: (raw) => raw,
  });
}

describe("EbookTagService.getIsbn", () => {
  it("should_prefer_isbn13 (translated from EbookTagServiceFixture.cs)", () => {
    const service = makeService();
    const ids = [{ identifier: "4087738574" }, { identifier: "9781455546176" }];

    expect(service.getIsbn(ids)).toBe("9781455546176");
  });

  it("prefers a 979-prefixed ISBN-13 over a valid ISBN-10 when no 978 candidate exists", () => {
    const service = makeService();
    // 9791234567896 is a valid checksum ISBN-13 with a 979 prefix.
    const ids = [{ identifier: "0136091814" }, { identifier: "9791234567896" }];

    expect(service.getIsbn(ids)).toBe("9791234567896");
  });

  it("falls back to any valid ISBN when none start with 978 or 979", () => {
    const service = makeService();
    const ids = [{ identifier: "0136091814" }];

    expect(service.getIsbn(ids)).toBe("0136091814");
  });

  it("rejects identifiers that fail ISBN-10/13 checksum validation", () => {
    const service = makeService();
    // Same digits as a valid ISBN-10 above but with the check digit altered.
    const ids = [{ identifier: "0136091815" }];

    expect(service.getIsbn(ids)).toBeNull();
  });

  it("strips non-ISBN characters before validating", () => {
    const service = makeService();
    const ids = [{ identifier: "ISBN 978-1-4555-4617-6" }];

    expect(service.getIsbn(ids)).toBe("9781455546176");
  });

  it("returns null when given no identifiers", () => {
    const service = makeService();
    expect(service.getIsbn([])).toBeNull();
  });
});
