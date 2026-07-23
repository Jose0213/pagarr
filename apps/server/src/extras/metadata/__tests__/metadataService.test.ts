import { describe, expect, it, vi } from "vitest";
import { MetadataService } from "../metadataService.js";
import type { IConfigService } from "../../../config/configService.js";
import type {
  DiskTransferServiceLike,
  RecycleBinProviderLike,
  MediaFileAttributeServiceLike,
  BookFile,
} from "../../forwardRefs.js";
import type { RenameOtherExtraFileLike } from "../metadataService.js";
import type { IMetadataFactory } from "../metadataFactory.js";
import type { ICleanMetadataService } from "../cleanMetadataFileService.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import type { IMetadataFileService } from "../metadataFileService.js";
import type { BookService } from "../../../books/bookService.js";
import type { IMetadata } from "../metadataBase.js";
import type { Author } from "../../../books/models.js";
import { MetadataFileResult } from "../metadataFileResult.js";
import { ImageFileResult } from "../imageFileResult.js";
import { MetadataType } from "../metadataType.js";
import { newMetadataFile, type MetadataFile } from "../metadataFile.js";
import { sha256Hash } from "../../hashing.js";

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
    edition: { bookId: 42 } as BookFile["edition"],
    ...overrides,
  };
}

function makeMetadataFileService(
  initial: MetadataFile[] = []
): IMetadataFileService & { rows: MetadataFile[] } {
  const rows = [...initial];
  return {
    rows,
    getFilesByAuthor: (authorId) => rows.filter((r) => r.authorId === authorId),
    getFilesByBookFile: (bookFileId) => rows.filter((r) => r.bookFileId === bookFileId),
    findByPath: (authorId, path) =>
      rows.find((r) => r.authorId === authorId && r.relativePath === path),
    upsert: vi.fn(),
    upsertMany: vi.fn(),
    delete: vi.fn((id: number) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    }),
    deleteMany: vi.fn(),
  };
}

function makeService(overrides: {
  consumer: IMetadata;
  metadataFileService?: IMetadataFileService;
  httpClient?: IHttpClient;
  recycleBinProvider?: RecycleBinProviderLike;
  cleanMetadataService?: ICleanMetadataService;
}): MetadataService {
  const configService = { copyUsingHardlinks: false } as IConfigService;
  const diskTransferService: DiskTransferServiceLike = { transferFile: vi.fn(() => 1) };
  const recycleBinProvider = overrides.recycleBinProvider ?? { deleteFile: vi.fn() };
  const otherExtraFileRenamer: RenameOtherExtraFileLike = { renameOtherExtraFile: vi.fn() };
  const metadataFactory: IMetadataFactory = {
    enabled: () => [overrides.consumer],
    getAvailableProviders: () => [overrides.consumer],
    initializeProviders: vi.fn(),
  };
  const cleanMetadataService = overrides.cleanMetadataService ?? { clean: vi.fn() };
  const httpClient =
    overrides.httpClient ?? ({ downloadFile: vi.fn(async () => {}) } as unknown as IHttpClient);
  const mediaFileAttributeService: MediaFileAttributeServiceLike = { setFilePermissions: vi.fn() };
  const metadataFileService = overrides.metadataFileService ?? makeMetadataFileService();
  const bookService = {} as BookService;

  return new MetadataService(
    configService,
    diskTransferService,
    recycleBinProvider,
    otherExtraFileRenamer,
    metadataFactory,
    cleanMetadataService,
    httpClient,
    mediaFileAttributeService,
    metadataFileService,
    bookService,
    { folderExists: () => true }
  );
}

function consumerNamed(name: string, impl: Partial<IMetadata>): IMetadata {
  class Named {}
  Object.defineProperty(Named, "name", { value: name });
  const instance = Object.create(Named.prototype) as IMetadata;
  return Object.assign(instance, { name, ...impl });
}

describe("MetadataService.createAfterAuthorScan", () => {
  it("cleans stale metadata, skips entirely when the author folder is missing", async () => {
    const clean = vi.fn();
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => null,
      authorImages: () => [],
      bookMetadata: () => null,
    });
    const service = makeService({ consumer, cleanMetadataService: { clean } });

    const configService = { copyUsingHardlinks: false } as IConfigService;
    const svc = new MetadataService(
      configService,
      { transferFile: vi.fn() },
      { deleteFile: vi.fn() },
      { renameOtherExtraFile: vi.fn() },
      {
        enabled: () => [consumer],
        getAvailableProviders: () => [consumer],
        initializeProviders: vi.fn(),
      },
      { clean },
      { downloadFile: vi.fn(async () => {}) } as unknown as IHttpClient,
      { setFilePermissions: vi.fn() },
      makeMetadataFileService(),
      {} as BookService,
      { folderExists: () => false }
    );

    const result = await svc.createAfterAuthorScan(makeAuthor(), []);

    expect(clean).toHaveBeenCalled();
    expect(result).toEqual([]);
    void service;
  });

  it("writes author metadata when the hash changed and upserts the new MetadataFile", async () => {
    const contents = "<opf>author metadata</opf>";
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => new MetadataFileResult("author.opf", contents),
      authorImages: () => [],
      bookMetadata: () => null,
    });
    const metadataFileService = makeMetadataFileService();
    const service = makeService({ consumer, metadataFileService });

    const files = await service.createAfterAuthorScan(makeAuthor(), []);

    expect(files).toHaveLength(1);
    expect(files[0]!.type).toBe(MetadataType.AuthorMetadata);
    expect(files[0]!.hash).toBe(sha256Hash(contents));
    expect(metadataFileService.upsertMany).toHaveBeenCalledWith(files);
  });

  it("skips re-writing author metadata when the hash matches an existing row", async () => {
    const contents = "<opf>author metadata</opf>";
    const hash = sha256Hash(contents);
    const existing = newMetadataFile({
      id: 1,
      authorId: 1,
      relativePath: "author.opf",
      consumer: "TestConsumer",
      type: MetadataType.AuthorMetadata,
      hash,
    });
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => new MetadataFileResult("author.opf", contents),
      authorImages: () => [],
      bookMetadata: () => null,
    });
    const metadataFileService = makeMetadataFileService([existing]);
    const service = makeService({ consumer, metadataFileService });

    const files = await service.createAfterAuthorScan(makeAuthor(), []);

    expect(files).toHaveLength(0);
  });

  it("downloads author images that don't already exist and adds them to the result", async () => {
    const downloadFile = vi.fn(async () => {});
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => null,
      authorImages: () => [new ImageFileResult("cover.jpg", "http://example.com/cover.jpg")],
      bookMetadata: () => null,
    });
    const httpClient = { downloadFile } as unknown as IHttpClient;
    const service = makeService({ consumer, httpClient });

    const files = await service.createAfterAuthorScan(makeAuthor(), []);

    expect(downloadFile).toHaveBeenCalledWith(
      "http://example.com/cover.jpg",
      "/books/author/cover.jpg"
    );
    expect(files).toHaveLength(1);
    expect(files[0]!.type).toBe(MetadataType.AuthorImage);
  });

  it("writes per-bookFile metadata for every book file passed in", async () => {
    const contents = "<opf>book metadata</opf>";
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => null,
      authorImages: () => [],
      bookMetadata: () => new MetadataFileResult("book/Book Title.opf", contents),
    });
    const service = makeService({ consumer });

    const files = await service.createAfterAuthorScan(makeAuthor(), [makeBookFile()]);

    expect(files).toHaveLength(1);
    expect(files[0]!.type).toBe(MetadataType.BookMetadata);
    expect(files[0]!.bookFileId).toBe(5);
  });
});

describe("MetadataService.createAfterBookImport", () => {
  it("is synchronous and writes book metadata for the single book file", () => {
    const contents = "<opf>book metadata</opf>";
    const consumer = consumerNamed("TestConsumer", {
      bookMetadata: () => new MetadataFileResult("book/Book Title.opf", contents),
    });
    const service = makeService({ consumer });

    const files = service.createAfterBookImport(makeAuthor(), makeBookFile());

    expect(files).toHaveLength(1);
    expect(files[0]!.type).toBe(MetadataType.BookMetadata);
  });
});

describe("MetadataService.createAfterBookImportWithFolders", () => {
  it("returns empty when both authorFolder and bookFolder are blank", async () => {
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => new MetadataFileResult("author.opf", "x"),
      authorImages: () => [],
    });
    const service = makeService({ consumer });

    const files = await service.createAfterBookImportWithFolders(
      makeAuthor(),
      {} as never,
      null,
      null
    );

    expect(files).toEqual([]);
  });

  it("writes author metadata/images when authorFolder is provided", async () => {
    const consumer = consumerNamed("TestConsumer", {
      authorMetadata: () => new MetadataFileResult("author.opf", "x"),
      authorImages: () => [],
    });
    const service = makeService({ consumer });

    const files = await service.createAfterBookImportWithFolders(
      makeAuthor(),
      {} as never,
      "author-folder",
      null
    );

    expect(files).toHaveLength(1);
    expect(files[0]!.type).toBe(MetadataType.AuthorMetadata);
  });
});

describe("MetadataService.import", () => {
  it("always returns null (MetadataService never imports pre-existing files this way)", () => {
    const consumer = consumerNamed("TestConsumer", {});
    const service = makeService({ consumer });

    expect(service.import()).toBeNull();
  });
});

describe("MetadataService.moveFilesAfterRename", () => {
  it("moves book-level metadata files whose consumer-computed filename differs from the current one", () => {
    const consumer = consumerNamed("TestConsumer", {
      getFilenameAfterMoveForBookFile: () => "/books/author/book/Book Title.jpg",
    });
    const existing = newMetadataFile({
      id: 1,
      authorId: 1,
      bookFileId: 5,
      relativePath: "book/old-cover.jpg",
      consumer: "TestConsumer",
      type: MetadataType.BookImage,
    });
    const metadataFileService = makeMetadataFileService([existing]);
    const service = makeService({ consumer, metadataFileService });

    const moved = service.moveFilesAfterRename(makeAuthor(), [makeBookFile()]);

    expect(moved).toHaveLength(1);
    expect(moved[0]!.relativePath).toBe("book/Book Title.jpg");
  });

  it("does not move a file whose computed filename already matches", () => {
    const consumer = consumerNamed("TestConsumer", {
      getFilenameAfterMoveForBookFile: () => "/books/author/book/existing.jpg",
    });
    const existing = newMetadataFile({
      id: 1,
      authorId: 1,
      bookFileId: 5,
      relativePath: "book/existing.jpg",
      consumer: "TestConsumer",
      type: MetadataType.BookImage,
    });
    const metadataFileService = makeMetadataFileService([existing]);
    const service = makeService({ consumer, metadataFileService });

    const moved = service.moveFilesAfterRename(makeAuthor(), [makeBookFile()]);

    expect(moved).toHaveLength(0);
  });
});
