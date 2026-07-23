import { describe, expect, it } from "vitest";
import { MetadataBase } from "../metadataBase.js";
import { MetadataType } from "../metadataType.js";
import type { Author } from "../../../books/models.js";
import type { BookFile } from "../../forwardRefs.js";
import type { MetadataFile } from "../metadataFile.js";
import type { MetadataFileResult } from "../metadataFileResult.js";
import type { ImageFileResult } from "../imageFileResult.js";

class TestMetadata extends MetadataBase<Record<string, never>> {
  readonly name = "TestMetadata";
  findMetadataFile(): MetadataFile | null {
    return null;
  }
  authorMetadata(): MetadataFileResult | null {
    return null;
  }
  bookMetadata(): MetadataFileResult | null {
    return null;
  }
  authorImages(): ImageFileResult[] {
    return [];
  }
  bookImages(): ImageFileResult[] {
    return [];
  }
}

function makeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 1,
    cleanName: "author",
    monitored: true,
    monitorNewItems: 0,
    lastInfoSync: null,
    path: "/books/author",
    rootFolderPath: "/books",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    ...overrides,
  };
}

function makeBookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    id: 5,
    path: "/books/author/book/Book Title.epub",
    editionId: 1,
    ...overrides,
  };
}

function makeMetadataFile(overrides: Partial<MetadataFile> = {}): MetadataFile {
  return {
    id: 1,
    authorId: 1,
    bookFileId: null,
    bookId: null,
    relativePath: "book/Book Title.opf",
    added: "",
    lastUpdated: "",
    extension: ".opf",
    hash: null,
    consumer: "TestMetadata",
    type: MetadataType.BookMetadata,
    ...overrides,
  };
}

describe("MetadataBase.test", () => {
  it("always returns a valid result", () => {
    const metadata = new TestMetadata({});
    expect(metadata.test()).toEqual({ isValid: true, hasWarnings: false, errors: [] });
  });
});

describe("MetadataBase.getFilenameAfterMoveForBookFile", () => {
  it("changes the book file's extension to the metadata file's own extension", () => {
    const metadata = new TestMetadata({});
    const result = metadata.getFilenameAfterMoveForBookFile(
      makeAuthor(),
      makeBookFile(),
      makeMetadataFile({ relativePath: "book/old.opf" })
    );

    expect(result).toBe("/books/author/book/Book Title.opf");
  });
});

describe("MetadataBase.getFilenameAfterMoveForBookPath", () => {
  it("joins the author path, book path, and the metadata file's own filename", () => {
    const metadata = new TestMetadata({});
    const result = metadata.getFilenameAfterMoveForBookPath(
      makeAuthor(),
      "book",
      makeMetadataFile({ relativePath: "old-book/cover.jpg" })
    );

    expect(result).toBe("/books/author/book/cover.jpg");
  });
});
