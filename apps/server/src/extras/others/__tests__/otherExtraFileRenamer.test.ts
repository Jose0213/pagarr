import { describe, expect, it, vi } from "vitest";
import { OtherExtraFileRenamer } from "../otherExtraFileRenamer.js";
import type { IOtherExtraFileService } from "../otherExtraFileService.js";
import type { RecycleBinProviderLike } from "../../forwardRefs.js";
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

describe("OtherExtraFileRenamer.renameOtherExtraFile", () => {
  it("does nothing when the path doesn't exist on disk", () => {
    const otherExtraFileService = { findByPath: vi.fn() } as unknown as IOtherExtraFileService;
    const renamer = new OtherExtraFileRenamer(
      otherExtraFileService,
      {},
      { deleteFile: vi.fn() },
      {
        fileExists: () => false,
      }
    );

    renamer.renameOtherExtraFile(makeAuthor(), "/books/author/cover.jpg");

    expect(otherExtraFileService.findByPath).not.toHaveBeenCalled();
  });

  it("does nothing when the path isn't a tracked OtherExtraFile", () => {
    const otherExtraFileService = {
      findByPath: () => undefined,
      upsert: vi.fn(),
    } as unknown as IOtherExtraFileService;
    const moveFile = vi.fn();
    const renamer = new OtherExtraFileRenamer(
      otherExtraFileService,
      {},
      { deleteFile: vi.fn() },
      {
        fileExists: () => true,
        moveFile,
      }
    );

    renamer.renameOtherExtraFile(makeAuthor(), "/books/author/cover.jpg");

    expect(moveFile).not.toHaveBeenCalled();
  });

  it("renames a tracked file to '-orig' and upserts the updated relativePath/extension", () => {
    const tracked = newOtherExtraFile({
      id: 1,
      authorId: 1,
      relativePath: "cover.jpg",
      extension: ".jpg",
    });
    const otherExtraFileService = {
      findByPath: vi.fn(() => tracked),
      upsert: vi.fn(),
    } as unknown as IOtherExtraFileService;
    const moveFile = vi.fn();
    const recycleBinProvider: RecycleBinProviderLike = { deleteFile: vi.fn() };
    const renamer = new OtherExtraFileRenamer(otherExtraFileService, {}, recycleBinProvider, {
      fileExists: (path) => path === "/books/author/cover.jpg",
      moveFile,
    });

    renamer.renameOtherExtraFile(makeAuthor(), "/books/author/cover.jpg");

    expect(moveFile).toHaveBeenCalledWith(
      "/books/author/cover.jpg",
      "/books/author/cover.jpg-orig"
    );
    expect(tracked.relativePath).toBe("cover.jpg-orig");
    expect(tracked.extension).toBe(".jpg-orig");
    expect(otherExtraFileService.upsert).toHaveBeenCalledWith(tracked);
  });

  it("recycles a pre-existing -orig file before renaming the new one onto it", () => {
    const origTracked = newOtherExtraFile({
      id: 2,
      authorId: 1,
      relativePath: "cover.jpg-orig",
      extension: ".jpg-orig",
    });
    const newTracked = newOtherExtraFile({
      id: 1,
      authorId: 1,
      relativePath: "cover.jpg",
      extension: ".jpg",
    });

    const otherExtraFileService = {
      findByPath: vi.fn((_authorId: number, path: string) => {
        if (path === "cover.jpg") return newTracked;
        if (path === "cover.jpg-orig") return origTracked;
        return undefined;
      }),
      upsert: vi.fn(),
    } as unknown as IOtherExtraFileService;
    const deleteFile = vi.fn();
    const renamer = new OtherExtraFileRenamer(
      otherExtraFileService,
      {},
      { deleteFile },
      {
        fileExists: () => true,
        moveFile: vi.fn(),
      }
    );

    renamer.renameOtherExtraFile(makeAuthor(), "/books/author/cover.jpg");

    expect(deleteFile).toHaveBeenCalledWith("/books/author/cover.jpg-orig", "");
  });
});
