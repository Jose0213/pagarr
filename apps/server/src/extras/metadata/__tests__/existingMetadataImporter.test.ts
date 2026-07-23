import { describe, expect, it, vi } from "vitest";
import { ExistingMetadataImporter } from "../existingMetadataImporter.js";
import type { IMetadataFileService } from "../metadataFileService.js";
import type { IMetadata } from "../metadataBase.js";
import { MetadataType } from "../metadataType.js";
import { newMetadataFile } from "../metadataFile.js";
import { AugmentingFailedError, type AugmentingServiceLike } from "../../forwardRefs.js";
import type { ParsingService } from "../../../parser/parsingService.js";
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

function makeMetadataFileService(): IMetadataFileService {
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

describe("ExistingMetadataImporter", () => {
  it("has Order 0, matching the real C# ExistingMetadataImporter.Order", () => {
    const importer = new ExistingMetadataImporter(
      makeMetadataFileService(),
      [],
      {} as ParsingService,
      { augment: vi.fn() },
      () => []
    );

    expect(importer.order).toBe(0);
  });

  it("skips a file when no consumer recognizes it", () => {
    const consumer: IMetadata = { findMetadataFile: vi.fn(() => null) } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      {} as ParsingService,
      { augment: vi.fn() },
      () => []
    );

    const result = importer.processFiles(makeAuthor(), ["/books/author/unknown.txt"], []);

    expect(result).toEqual([]);
  });

  it("for AuthorMetadata type: adds the file directly, without needing a local book match", () => {
    const foundMetadata = newMetadataFile({
      type: MetadataType.AuthorMetadata,
      relativePath: "author.opf",
    });
    const consumer: IMetadata = { findMetadataFile: () => foundMetadata } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      {} as ParsingService,
      { augment: vi.fn() },
      () => []
    );

    const result = importer.processFiles(makeAuthor(), ["/books/author/author.opf"], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe(MetadataType.AuthorMetadata);
  });

  it("for BookImage/BookMetadata types: skips when getLocalBook can't resolve a single book (multiple books in folder)", () => {
    const foundMetadata = newMetadataFile({
      type: MetadataType.BookImage,
      relativePath: "book/cover.jpg",
    });
    const consumer: IMetadata = { findMetadataFile: () => foundMetadata } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const parsingService = { getLocalBook: vi.fn(() => undefined) } as unknown as ParsingService;
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      parsingService,
      { augment: vi.fn() },
      () => []
    );

    const result = importer.processFiles(makeAuthor(), ["/books/author/book/cover.jpg"], []);

    expect(result).toEqual([]);
  });

  it("for BookImage type: sets metadata.bookId from getLocalBook and includes the file", () => {
    const foundMetadata = newMetadataFile({
      type: MetadataType.BookImage,
      relativePath: "book/cover.jpg",
    });
    const consumer: IMetadata = { findMetadataFile: () => foundMetadata } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const book = { id: 42 } as Book;
    const parsingService = { getLocalBook: vi.fn(() => book) } as unknown as ParsingService;
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      parsingService,
      { augment: vi.fn() },
      () => []
    );

    const result = importer.processFiles(makeAuthor(), ["/books/author/book/cover.jpg"], []);

    expect(result).toHaveLength(1);
    expect(result[0]!.bookId).toBe(42);
  });

  it("for BookMetadata type: also requires augmenting to resolve a book, skips on AugmentingFailedError", () => {
    const foundMetadata = newMetadataFile({
      type: MetadataType.BookMetadata,
      relativePath: "book/book.opf",
    });
    const consumer: IMetadata = { findMetadataFile: () => foundMetadata } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const book = { id: 42 } as Book;
    const parsingService = { getLocalBook: vi.fn(() => book) } as unknown as ParsingService;
    const augment = vi.fn(() => {
      throw new AugmentingFailedError("cannot parse");
    });
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      parsingService,
      { augment },
      () => []
    );

    const result = importer.processFiles(makeAuthor(), ["/books/author/book/book.opf"], []);

    expect(result).toEqual([]);
  });

  it("for BookMetadata type: includes the file when augmenting succeeds and resolves a book", () => {
    const foundMetadata = newMetadataFile({
      type: MetadataType.BookMetadata,
      relativePath: "book/book.opf",
    });
    const consumer: IMetadata = { findMetadataFile: () => foundMetadata } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const book = { id: 42 } as Book;
    const parsingService = { getLocalBook: vi.fn(() => book) } as unknown as ParsingService;
    const augment = vi.fn(() => ({ fileTrackInfo: null, author: makeAuthor(), path: "x", book }));
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      parsingService,
      { augment },
      () => []
    );

    const result = importer.processFiles(makeAuthor(), ["/books/author/book/book.opf"], []);

    expect(result).toHaveLength(1);
    expect(metadataFileService.upsertMany).toHaveBeenCalledWith(result);
  });

  it("re-throws a non-AugmentingFailedError exception from augmenting", () => {
    const foundMetadata = newMetadataFile({
      type: MetadataType.BookMetadata,
      relativePath: "book/book.opf",
    });
    const consumer: IMetadata = { findMetadataFile: () => foundMetadata } as unknown as IMetadata;
    const metadataFileService = makeMetadataFileService();
    const book = { id: 42 } as Book;
    const parsingService = { getLocalBook: vi.fn(() => book) } as unknown as ParsingService;
    const augment = vi.fn(() => {
      throw new Error("boom");
    });
    const importer = new ExistingMetadataImporter(
      metadataFileService,
      [consumer],
      parsingService,
      { augment },
      () => []
    );

    expect(() => importer.processFiles(makeAuthor(), ["/books/author/book/book.opf"], [])).toThrow(
      "boom"
    );
  });
});
