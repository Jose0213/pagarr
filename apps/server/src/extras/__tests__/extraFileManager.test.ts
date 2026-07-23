import { describe, expect, it, vi } from "vitest";
import { ExtraFileManager } from "../extraFileManager.js";
import type { IConfigService } from "../../config/configService.js";
import { TransferMode, type BookFile, type DiskTransferServiceLike } from "../forwardRefs.js";
import type { Author } from "../../books/models.js";
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

function makeBookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    id: 5,
    path: "/books/author/book/Book Title.epub",
    editionId: 1,
    edition: { bookId: 42 } as BookFile["edition"],
    ...overrides,
  };
}

function makeConfigService(copyUsingHardlinks = false): IConfigService {
  return { copyUsingHardlinks } as IConfigService;
}

/** Minimal concrete subclass exposing the two protected helpers for direct testing, matching how metadata/others' real subclasses call them. */
class TestExtraFileManager extends ExtraFileManager<ExtraFile> {
  readonly order = 0;
  createAfterAuthorScan(): ExtraFile[] {
    return [];
  }
  createAfterBookImport(): ExtraFile[] {
    return [];
  }
  createAfterBookImportWithFolders(): ExtraFile[] {
    return [];
  }
  moveFilesAfterRename(): ExtraFile[] {
    return [];
  }
  import(): ExtraFile | null {
    return null;
  }

  public callImportFile(
    author: Author,
    bookFile: BookFile,
    path: string,
    readOnly: boolean,
    extension: string,
    fileNameSuffix: string | null = null
  ) {
    return this.importFile(author, bookFile, path, readOnly, extension, fileNameSuffix);
  }

  public callMoveFile(author: Author, bookFile: BookFile, extraFile: ExtraFile) {
    return this.moveFile(author, bookFile, extraFile);
  }
}

describe("ExtraFileManager.importFile", () => {
  it("transfers with Move mode when not readOnly", () => {
    const transferFile = vi.fn();
    const manager = new TestExtraFileManager(makeConfigService(), { transferFile });

    const result = manager.callImportFile(
      makeAuthor(),
      makeBookFile(),
      "/src/cover.jpg",
      false,
      ".jpg"
    );

    expect(transferFile).toHaveBeenCalledWith(
      "/src/cover.jpg",
      "/books/author/book/Book Title.jpg",
      TransferMode.Move,
      true
    );
    expect(result.relativePath).toBe("book/Book Title.jpg");
    expect(result.bookId).toBe(42);
    expect(result.bookFileId).toBe(5);
    expect(result.authorId).toBe(1);
  });

  it("transfers with Copy mode when readOnly and hardlinks disabled", () => {
    const transferFile = vi.fn();
    const manager = new TestExtraFileManager(makeConfigService(false), { transferFile });

    manager.callImportFile(makeAuthor(), makeBookFile(), "/src/cover.jpg", true, ".jpg");

    expect(transferFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TransferMode.Copy,
      true
    );
  });

  it("transfers with HardLinkOrCopy mode when readOnly and hardlinks enabled", () => {
    const transferFile = vi.fn();
    const manager = new TestExtraFileManager(makeConfigService(true), { transferFile });

    manager.callImportFile(makeAuthor(), makeBookFile(), "/src/cover.jpg", true, ".jpg");

    expect(transferFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TransferMode.HardLinkOrCopy,
      true
    );
  });

  it("appends fileNameSuffix before the extension when provided", () => {
    const transferFile = vi.fn();
    const manager = new TestExtraFileManager(makeConfigService(), { transferFile });

    const result = manager.callImportFile(
      makeAuthor(),
      makeBookFile(),
      "/src/cover.jpg",
      false,
      ".jpg",
      "-thumb"
    );

    expect(result.relativePath).toBe("book/Book Title-thumb.jpg");
  });

  it("throws if the BookFile's Edition has not been loaded", () => {
    const manager = new TestExtraFileManager(makeConfigService(), { transferFile: vi.fn() });
    const bookFileWithoutEdition = makeBookFile({ edition: undefined });

    expect(() =>
      manager.callImportFile(makeAuthor(), bookFileWithoutEdition, "/src/cover.jpg", false, ".jpg")
    ).toThrow();
  });
});

describe("ExtraFileManager.moveFile", () => {
  it("moves the file on disk and updates relativePath when the target differs", () => {
    const moveFile = vi.fn();
    const manager = new TestExtraFileManager(
      makeConfigService(),
      { transferFile: vi.fn() },
      { moveFile }
    );

    const extraFile: ExtraFile = {
      id: 1,
      authorId: 1,
      bookFileId: 5,
      bookId: 42,
      relativePath: "book/old-name.jpg",
      extension: ".jpg",
      added: "",
      lastUpdated: "",
    };

    const result = manager.callMoveFile(makeAuthor(), makeBookFile(), extraFile);

    expect(moveFile).toHaveBeenCalledWith(
      "/books/author/book/old-name.jpg",
      "/books/author/book/Book Title.jpg"
    );
    expect(result?.relativePath).toBe("book/Book Title.jpg");
  });

  it("returns null without touching disk when source and target paths already match", () => {
    const moveFile = vi.fn();
    const manager = new TestExtraFileManager(
      makeConfigService(),
      { transferFile: vi.fn() },
      { moveFile }
    );

    const extraFile: ExtraFile = {
      id: 1,
      authorId: 1,
      bookFileId: 5,
      bookId: 42,
      relativePath: "book/Book Title.jpg",
      extension: ".jpg",
      added: "",
      lastUpdated: "",
    };

    const result = manager.callMoveFile(makeAuthor(), makeBookFile(), extraFile);

    expect(moveFile).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("swallows a disk error and returns null (matching the C# catch-and-warn)", () => {
    const moveFile = vi.fn(() => {
      throw new Error("disk error");
    });
    const manager = new TestExtraFileManager(
      makeConfigService(),
      { transferFile: vi.fn() },
      { moveFile }
    );

    const extraFile: ExtraFile = {
      id: 1,
      authorId: 1,
      bookFileId: 5,
      bookId: 42,
      relativePath: "book/old-name.jpg",
      extension: ".jpg",
      added: "",
      lastUpdated: "",
    };

    const result = manager.callMoveFile(makeAuthor(), makeBookFile(), extraFile);

    expect(result).toBeNull();
  });
});
