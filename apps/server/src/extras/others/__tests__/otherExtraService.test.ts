import { describe, expect, it, vi } from "vitest";
import { OtherExtraService } from "../otherExtraService.js";
import type { IConfigService } from "../../../config/configService.js";
import type {
  DiskTransferServiceLike,
  MediaFileAttributeServiceLike,
  BookFile,
} from "../../forwardRefs.js";
import type { IOtherExtraFileService } from "../otherExtraFileService.js";
import type { Author } from "../../../books/models.js";
import { newOtherExtraFile } from "../otherExtraFile.js";

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

describe("OtherExtraService", () => {
  it("has Order 2, matching the real C# OtherExtraService.Order", () => {
    const service = new OtherExtraService(
      {} as IConfigService,
      { transferFile: vi.fn() },
      {} as IOtherExtraFileService,
      { setFilePermissions: vi.fn() }
    );

    expect(service.order).toBe(2);
  });

  it("createAfterAuthorScan/createAfterBookImport/createAfterBookImportWithFolders all return empty (Enumerable.Empty in C#)", () => {
    const service = new OtherExtraService(
      {} as IConfigService,
      { transferFile: vi.fn() },
      {} as IOtherExtraFileService,
      { setFilePermissions: vi.fn() }
    );

    expect(service.createAfterAuthorScan(makeAuthor(), [])).toEqual([]);
    expect(service.createAfterBookImport(makeAuthor(), makeBookFile())).toEqual([]);
    expect(service.createAfterBookImportWithFolders(makeAuthor(), {} as never, null, null)).toEqual(
      []
    );
  });

  it("import() transfers the file, sets permissions, and upserts via otherExtraFileService", () => {
    const upsert = vi.fn();
    const otherExtraFileService = { upsert } as unknown as IOtherExtraFileService;
    const setFilePermissions = vi.fn();
    const transferFile = vi.fn();

    const service = new OtherExtraService(
      { copyUsingHardlinks: false } as IConfigService,
      { transferFile },
      otherExtraFileService,
      { setFilePermissions }
    );

    const result = service.import(makeAuthor(), makeBookFile(), "/src/notes.txt", ".txt", false);

    expect(transferFile).toHaveBeenCalled();
    expect(setFilePermissions).toHaveBeenCalledWith("/src/notes.txt");
    expect(upsert).toHaveBeenCalledWith(result);
    expect(result?.relativePath).toBe("book/Book Title.txt");
  });

  it("moveFilesAfterRename moves extra files whose bookFileId matches a renamed book file", () => {
    const tracked = newOtherExtraFile({
      id: 1,
      authorId: 1,
      bookFileId: 5,
      relativePath: "book/old-notes.txt",
      extension: ".txt",
    });
    const otherExtraFileService = {
      getFilesByAuthor: () => [tracked],
      upsertMany: vi.fn(),
    } as unknown as IOtherExtraFileService;
    const moveFileOnDisk = vi.fn();

    const service = new OtherExtraService(
      { copyUsingHardlinks: false } as IConfigService,
      { transferFile: vi.fn() },
      otherExtraFileService,
      { setFilePermissions: vi.fn() },
      { moveFile: moveFileOnDisk }
    );

    const moved = service.moveFilesAfterRename(makeAuthor(), [makeBookFile()]);

    expect(moved).toHaveLength(1);
    expect(moved[0]!.relativePath).toBe("book/Book Title.txt");
    expect(otherExtraFileService.upsertMany).toHaveBeenCalledWith(moved);
  });
});
