import { describe, expect, it, vi } from "vitest";
import { ExistingOtherExtraImporter } from "../existingOtherExtraImporter.js";
import type { IOtherExtraFileService } from "../otherExtraFileService.js";
import { AugmentingFailedError, type AugmentingServiceLike } from "../../forwardRefs.js";
import type { Author, Book } from "../../../books/models.js";

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

function makeOtherExtraFileService(): IOtherExtraFileService {
  return {
    getFilesByAuthor: () => [],
    getFilesByBookFile: () => [],
    findByPath: () => undefined,
    upsert: vi.fn(),
    upsertMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

describe("ExistingOtherExtraImporter", () => {
  it("has Order 2, matching the real C# ExistingOtherExtraImporter.Order", () => {
    const importer = new ExistingOtherExtraImporter(makeOtherExtraFileService(), {
      augment: vi.fn(),
    });

    expect(importer.order).toBe(2);
  });

  it("skips files with no extension", () => {
    const augment = vi.fn();
    const otherExtraFileService = makeOtherExtraFileService();
    const importer = new ExistingOtherExtraImporter(otherExtraFileService, { augment });

    const result = importer.processFiles(makeAuthor(), ["/books/author/README"], []);

    expect(augment).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("skips a file when augmenting fails to parse it (AugmentingFailedError)", () => {
    const augment = vi.fn(() => {
      throw new AugmentingFailedError("cannot parse");
    });
    const otherExtraFileService = makeOtherExtraFileService();
    const importer = new ExistingOtherExtraImporter(otherExtraFileService, { augment });

    const result = importer.processFiles(makeAuthor(), ["/books/author/notes.txt"], []);

    expect(result).toEqual([]);
  });

  it("re-throws a non-AugmentingFailedError exception", () => {
    const augment = vi.fn(() => {
      throw new Error("something else broke");
    });
    const otherExtraFileService = makeOtherExtraFileService();
    const importer = new ExistingOtherExtraImporter(otherExtraFileService, { augment });

    expect(() => importer.processFiles(makeAuthor(), ["/books/author/notes.txt"], [])).toThrow(
      "something else broke"
    );
  });

  it("skips a file when no related book is found", () => {
    const augment = vi.fn(() => ({
      fileTrackInfo: null,
      author: makeAuthor(),
      path: "x",
      book: null,
    }));
    const otherExtraFileService = makeOtherExtraFileService();
    const importer = new ExistingOtherExtraImporter(otherExtraFileService, { augment });

    const result = importer.processFiles(makeAuthor(), ["/books/author/notes.txt"], []);

    expect(result).toEqual([]);
  });

  it("creates and upserts an OtherExtraFile for a successfully-augmented file", () => {
    const book = { id: 42 } as Book;
    const augment = vi.fn(() => ({ fileTrackInfo: null, author: makeAuthor(), path: "x", book }));
    const otherExtraFileService = makeOtherExtraFileService();
    const importer = new ExistingOtherExtraImporter(otherExtraFileService, { augment });

    const result = importer.processFiles(makeAuthor(), ["/books/author/book/notes.txt"], []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      authorId: 1,
      bookId: 42,
      relativePath: "book/notes.txt",
      extension: ".txt",
    });
    expect(otherExtraFileService.upsertMany).toHaveBeenCalledWith(result);
  });

  it("concatenates newly-imported files with filterResult.previouslyImported", () => {
    const existing = { id: 1, authorId: 1, relativePath: "book/old.txt" } as never;
    const otherExtraFileService: IOtherExtraFileService = {
      getFilesByAuthor: () => [existing],
      getFilesByBookFile: () => [],
      findByPath: () => undefined,
      upsert: vi.fn(),
      upsertMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const book = { id: 42 } as Book;
    const augment = vi.fn(() => ({ fileTrackInfo: null, author: makeAuthor(), path: "x", book }));
    const importer = new ExistingOtherExtraImporter(otherExtraFileService, { augment });

    const result = importer.processFiles(
      makeAuthor(),
      ["/books/author/book/old.txt", "/books/author/book/new.txt"],
      []
    );

    // old.txt is previouslyImported (already tracked), new.txt gets freshly imported.
    expect(result).toHaveLength(2);
  });
});
