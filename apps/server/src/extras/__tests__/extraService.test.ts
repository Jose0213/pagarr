import { describe, expect, it, vi } from "vitest";
import { ExtraService } from "../extraService.js";
import type { IManageExtraFiles } from "../extraFileManager.js";
import type { EditionService } from "../../books/editionService.js";
import type { IConfigService } from "../../config/configService.js";
import { BookAddType, type Author, type Book, type Edition } from "../../books/models.js";
import type { BookFile, MediaFileServiceLike } from "../forwardRefs.js";
import {
  AuthorRenamedEvent,
  MediaCoversUpdatedEvent,
  TrackFolderCreatedEvent,
} from "../forwardRefs.js";
import { newLocalBook } from "../../parser/model/localBook.js";
import type { ExtraFile } from "../extraFile.js";

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

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 42,
    authorMetadataId: 1,
    foreignBookId: "fb-1",
    titleSlug: "book-title",
    title: "Book Title",
    releaseDate: null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "book title",
    monitored: true,
    anyEditionOk: true,
    lastInfoSync: null,
    added: null,
    addOptions: { addType: BookAddType.Automatic, searchForNewBook: false },
    ...overrides,
  };
}

function makeEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 1,
    bookId: 42,
    foreignEditionId: "fe-1",
    titleSlug: "edition",
    isbn13: null,
    asin: null,
    title: "Edition",
    language: null,
    overview: "",
    format: null,
    isEbook: true,
    disambiguation: null,
    publisher: null,
    pageCount: 0,
    releaseDate: null,
    images: [],
    links: [],
    ratings: { votes: 0, value: 0 },
    monitored: true,
    manualAdd: false,
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

function makeManager(order: number, overrides: Partial<IManageExtraFiles> = {}): IManageExtraFiles {
  return {
    order,
    createAfterAuthorScan: vi.fn(() => []),
    createAfterBookImport: vi.fn(() => []),
    createAfterBookImportWithFolders: vi.fn(() => []),
    moveFilesAfterRename: vi.fn(() => []),
    import: vi.fn(() => null),
    ...overrides,
  };
}

describe("ExtraService.importBookFile", () => {
  it("skips extra-file import entirely when config.importExtraFiles is false", () => {
    const configService = { importExtraFiles: false } as IConfigService;
    const manager = makeManager(0);
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";
    localBook.author = makeAuthor();

    service.importBookFile(localBook, makeBookFile(), false);

    expect(manager.import).not.toHaveBeenCalled();
    // createAfterBookImport still runs (it's unconditional in the real C# ImportTrack).
    expect(manager.createAfterBookImport).toHaveBeenCalledWith(localBook.author, expect.anything());
  });

  it("throws if localBook.author has not been populated", () => {
    const configService = { importExtraFiles: false } as IConfigService;
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, []);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";

    expect(() => service.importBookFile(localBook, makeBookFile(), false)).toThrow();
  });

  it("calls each extraFileManager.createAfterBookImport in .order sequence", () => {
    const configService = { importExtraFiles: false } as IConfigService;
    const callOrder: number[] = [];
    const managerA = makeManager(2, {
      createAfterBookImport: vi.fn(() => (callOrder.push(2), [])),
    });
    const managerB = makeManager(0, {
      createAfterBookImport: vi.fn(() => (callOrder.push(0), [])),
    });
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    // Registered out of order to prove the constructor sorts by .order.
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      managerA,
      managerB,
    ]);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";
    localBook.author = makeAuthor();

    service.importBookFile(localBook, makeBookFile(), false);

    expect(callOrder).toEqual([0, 2]);
  });
});

describe("ExtraService.importExtraFiles", () => {
  it("filters candidate files by extension and stops at the first manager returning non-null", () => {
    const configService = {
      importExtraFiles: true,
      extraFileExtensions: "opf, jpg",
    } as IConfigService;

    const firstImport = vi.fn(() => ({ id: 1 }) as unknown as ExtraFile);
    const secondImport = vi.fn(() => null);
    const managerA = makeManager(0, { import: firstImport });
    const managerB = makeManager(1, { import: secondImport });

    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      managerA,
      managerB,
    ]);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";
    localBook.author = makeAuthor();

    service.importExtraFiles(
      localBook,
      makeBookFile(),
      false,
      () => "/books/author/book",
      () => ["/books/author/book/Book Title.opf", "/books/author/book/Unrelated.txt"]
    );

    expect(firstImport).toHaveBeenCalledTimes(1);
    expect(secondImport).not.toHaveBeenCalled();
  });

  it("skips files whose extension isn't in the wanted list", () => {
    const configService = { importExtraFiles: true, extraFileExtensions: "opf" } as IConfigService;
    const importFn = vi.fn(() => null);
    const manager = makeManager(0, { import: importFn });
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";
    localBook.author = makeAuthor();

    service.importExtraFiles(
      localBook,
      makeBookFile(),
      false,
      () => "/books/author/book",
      () => ["/books/author/book/Book Title.txt"]
    );

    expect(importFn).not.toHaveBeenCalled();
  });

  it("deduplicates multiple .nfo files, keeping only the first", () => {
    const configService = { importExtraFiles: true, extraFileExtensions: "nfo" } as IConfigService;
    const importedPaths: string[] = [];
    const manager = makeManager(0, {
      import: vi.fn((_author, _bookFile, path: string) => {
        importedPaths.push(path);
        return { id: 1 } as unknown as ExtraFile;
      }),
    });
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";
    localBook.author = makeAuthor();

    service.importExtraFiles(
      localBook,
      makeBookFile(),
      false,
      () => "/books/author/book",
      () => ["/books/author/book/Book Title.nfo", "/books/author/book/Book Title.extra.nfo"]
    );

    expect(importedPaths).toEqual(["/books/author/book/Book Title.nfo"]);
  });

  it("continues to the next file when a manager throws (catch-and-continue)", () => {
    const configService = {
      importExtraFiles: true,
      extraFileExtensions: "opf,jpg",
    } as IConfigService;
    const importFn = vi.fn((_author, _bookFile, path: string) => {
      if (path.endsWith(".opf")) {
        throw new Error("boom");
      }
      return { id: 1 } as unknown as ExtraFile;
    });
    const manager = makeManager(0, { import: importFn });
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    const localBook = newLocalBook();
    localBook.path = "/books/author/book/Book Title.epub";
    localBook.author = makeAuthor();

    expect(() =>
      service.importExtraFiles(
        localBook,
        makeBookFile(),
        false,
        () => "/books/author/book",
        () => ["/books/author/book/Book Title.opf", "/books/author/book/Book Title.jpg"]
      )
    ).not.toThrow();

    expect(importFn).toHaveBeenCalledTimes(2);
  });
});

describe("ExtraService.handleMediaCoversUpdated", () => {
  it("does nothing when the event has no author (Book-only overload)", async () => {
    const configService = {} as IConfigService;
    const manager = makeManager(0);
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: vi.fn(() => []) };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    await service.handleMediaCoversUpdated(new MediaCoversUpdatedEvent(undefined, makeBook()));

    expect(mediaFileService.getFilesByAuthor).not.toHaveBeenCalled();
  });

  it("calls createAfterAuthorScan on every manager with the author's book files", async () => {
    const configService = {} as IConfigService;
    const manager = makeManager(0);
    const bookFiles = [makeBookFile()];
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => bookFiles };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    const author = makeAuthor();
    await service.handleMediaCoversUpdated(new MediaCoversUpdatedEvent(author));

    expect(manager.createAfterAuthorScan).toHaveBeenCalledWith(author, bookFiles);
  });
});

describe("ExtraService.handleTrackFolderCreated", () => {
  it("looks up the edition's book and calls createAfterBookImportWithFolders on every manager", async () => {
    const configService = {} as IConfigService;
    const manager = makeManager(0);
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const book = makeBook();
    const edition = makeEdition({ book });
    const editionService = { getEdition: vi.fn(() => edition) } as unknown as EditionService;
    const service = new ExtraService(mediaFileService, editionService, configService, [manager]);

    const author = makeAuthor();
    const event = new TrackFolderCreatedEvent(author, makeBookFile());
    event.authorFolder = "author-folder";
    event.bookFolder = "book-folder";

    await service.handleTrackFolderCreated(event);

    expect(manager.createAfterBookImportWithFolders).toHaveBeenCalledWith(
      author,
      book,
      "author-folder",
      "book-folder"
    );
  });

  it("throws if the edition's book has not been loaded", async () => {
    const configService = {} as IConfigService;
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => [] };
    const edition = makeEdition({ book: undefined });
    const editionService = { getEdition: vi.fn(() => edition) } as unknown as EditionService;
    const service = new ExtraService(mediaFileService, editionService, configService, []);

    const event = new TrackFolderCreatedEvent(makeAuthor(), makeBookFile());

    await expect(service.handleTrackFolderCreated(event)).rejects.toThrow();
  });
});

describe("ExtraService.handleAuthorRenamed", () => {
  it("calls moveFilesAfterRename on every manager with the author's book files", () => {
    const configService = {} as IConfigService;
    const manager = makeManager(0);
    const bookFiles = [makeBookFile()];
    const mediaFileService: MediaFileServiceLike = { getFilesByAuthor: () => bookFiles };
    const service = new ExtraService(mediaFileService, {} as EditionService, configService, [
      manager,
    ]);

    const author = makeAuthor();
    service.handleAuthorRenamed(new AuthorRenamedEvent(author, []));

    expect(manager.moveFilesAfterRename).toHaveBeenCalledWith(author, bookFiles);
  });
});
