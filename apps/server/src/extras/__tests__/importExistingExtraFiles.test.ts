import { describe, expect, it, vi } from "vitest";
import { ImportExistingExtraFilesBase } from "../importExistingExtraFiles.js";
import type { IExtraFileService } from "../extraFileService.js";
import type { Author } from "../../books/models.js";
import { newOtherExtraFile, type OtherExtraFile } from "../others/otherExtraFile.js";
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

function makeFakeExtraFileService(files: OtherExtraFile[]): IExtraFileService<OtherExtraFile> & {
  deletedIds: number[];
} {
  const deletedIds: number[] = [];
  return {
    deletedIds,
    getFilesByAuthor: () => files,
    getFilesByBookFile: () => [],
    findByPath: () => undefined,
    upsert: vi.fn(),
    upsertMany: vi.fn(),
    delete: (id: number) => deletedIds.push(id),
    deleteMany: (ids: number[]) => deletedIds.push(...ids),
  };
}

/** Minimal concrete subclass to exercise the protected `filterAndClean` through a public wrapper, same as a real importer would call it. */
class TestImporter extends ImportExistingExtraFilesBase<OtherExtraFile> {
  readonly order = 0;

  processFiles(author: Author, filesOnDisk: string[], importedFiles: string[]): ExtraFile[] {
    const result = this.filterAndClean(author, filesOnDisk, importedFiles);
    return [
      ...result.previouslyImported,
      ...result.filesOnDisk.map((p) => ({ id: 0, path: p }) as unknown as ExtraFile),
    ];
  }

  public callFilterAndClean(author: Author, filesOnDisk: string[], importedFiles: string[]) {
    return this.filterAndClean(author, filesOnDisk, importedFiles);
  }
}

describe("ImportExistingExtraFilesBase.filterAndClean", () => {
  it("returns files already in the DB as previouslyImported, and only new files as filesOnDisk", () => {
    const author = makeAuthor();
    const existing = newOtherExtraFile({ id: 1, authorId: 1, relativePath: "cover.jpg" });
    const service = makeFakeExtraFileService([existing]);
    const importer = new TestImporter(service);

    const result = importer.callFilterAndClean(
      author,
      ["/books/author/cover.jpg", "/books/author/new-file.opf"],
      []
    );

    expect(result.previouslyImported).toEqual([existing]);
    expect(result.filesOnDisk).toEqual(["/books/author/new-file.opf"]);
  });

  it("excludes files already claimed by another importer (importedFiles) from filesOnDisk", () => {
    const author = makeAuthor();
    const service = makeFakeExtraFileService([]);
    const importer = new TestImporter(service);

    const result = importer.callFilterAndClean(
      author,
      ["/books/author/a.jpg", "/books/author/b.jpg"],
      ["/books/author/a.jpg"]
    );

    expect(result.filesOnDisk).toEqual(["/books/author/b.jpg"]);
  });

  it("deletes DB rows for files claimed by another importer in this pass (Clean's alreadyImportedFileIds)", () => {
    const author = makeAuthor();
    const existing = newOtherExtraFile({ id: 7, authorId: 1, relativePath: "dup.jpg" });
    const service = makeFakeExtraFileService([existing]);
    const importer = new TestImporter(service);

    importer.callFilterAndClean(author, ["/books/author/dup.jpg"], ["/books/author/dup.jpg"]);

    expect(service.deletedIds).toContain(7);
  });

  it("deletes DB rows for files no longer present on disk (Clean's deletedFileIds)", () => {
    const author = makeAuthor();
    const existing = newOtherExtraFile({ id: 9, authorId: 1, relativePath: "gone.jpg" });
    const service = makeFakeExtraFileService([existing]);
    const importer = new TestImporter(service);

    // gone.jpg is NOT in filesOnDisk at all -- it was deleted out-of-band.
    importer.callFilterAndClean(author, ["/books/author/other.jpg"], []);

    expect(service.deletedIds).toContain(9);
  });

  it("does not delete a DB row that's still present on disk and not claimed by anyone", () => {
    const author = makeAuthor();
    const existing = newOtherExtraFile({ id: 3, authorId: 1, relativePath: "keep.jpg" });
    const service = makeFakeExtraFileService([existing]);
    const importer = new TestImporter(service);

    const result = importer.callFilterAndClean(author, ["/books/author/keep.jpg"], []);

    expect(service.deletedIds).not.toContain(3);
    expect(result.previouslyImported).toEqual([existing]);
  });
});
