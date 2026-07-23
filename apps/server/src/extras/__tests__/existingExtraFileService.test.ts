import { describe, expect, it, vi } from "vitest";
import { ExistingExtraFileService } from "../existingExtraFileService.js";
import type { IImportExistingExtraFiles } from "../importExistingExtraFiles.js";
import type { Author } from "../../books/models.js";
import { AuthorScannedEvent } from "../forwardRefs.js";
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

function fakeImporter(
  order: number,
  processFiles: IImportExistingExtraFiles["processFiles"]
): IImportExistingExtraFiles {
  return { order, processFiles };
}

describe("ExistingExtraFileService.handle", () => {
  it("does nothing if the author's folder does not exist", () => {
    const importer = fakeImporter(
      0,
      vi.fn(() => [])
    );
    const service = new ExistingExtraFileService([importer], { folderExists: () => false });

    service.handle(new AuthorScannedEvent(makeAuthor()));

    expect(importer.processFiles).not.toHaveBeenCalled();
  });

  it("runs importers in order and threads each importer's imported files into the next", () => {
    const calls: Array<{ order: number; importedFiles: string[] }> = [];

    const firstImporter = fakeImporter(0, (_author, filesOnDisk, importedFiles) => {
      calls.push({ order: 0, importedFiles: [...importedFiles] });
      return [{ relativePath: "a.opf" } as ExtraFile];
    });

    const secondImporter = fakeImporter(2, (_author, filesOnDisk, importedFiles) => {
      calls.push({ order: 2, importedFiles: [...importedFiles] });
      return [];
    });

    // Registered out of order to prove the service sorts by .order itself.
    const service = new ExistingExtraFileService([secondImporter, firstImporter], {
      folderExists: () => true,
      getNonBookFiles: () => ["/books/author/a.opf", "/books/author/b.jpg"],
      filterPaths: (_authorPath, files) => files,
    });

    service.handle(new AuthorScannedEvent(makeAuthor()));

    expect(calls).toHaveLength(2);
    expect(calls[0]!.order).toBe(0);
    expect(calls[0]!.importedFiles).toEqual([]);
    expect(calls[1]!.order).toBe(2);
    expect(calls[1]!.importedFiles).toEqual(["/books/author/a.opf"]);
  });

  it("passes filterPaths' output (not the raw getNonBookFiles list) to importers", () => {
    const processFiles = vi.fn(() => []);
    const importer = fakeImporter(0, processFiles);

    const service = new ExistingExtraFileService([importer], {
      folderExists: () => true,
      getNonBookFiles: () => ["/books/author/a.opf", "/books/author/b.jpg"],
      filterPaths: () => ["/books/author/a.opf"],
    });

    service.handle(new AuthorScannedEvent(makeAuthor()));

    expect(processFiles).toHaveBeenCalledWith(expect.anything(), ["/books/author/a.opf"], []);
  });
});
