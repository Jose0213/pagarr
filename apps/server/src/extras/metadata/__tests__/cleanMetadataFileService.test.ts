import { describe, expect, it, vi } from "vitest";
import { CleanExtraFileService } from "../cleanMetadataFileService.js";
import type { IMetadataFileService } from "../metadataFileService.js";
import type { Author } from "../../../books/models.js";
import { newMetadataFile } from "../metadataFile.js";

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

describe("CleanExtraFileService.clean", () => {
  it("deletes DB rows for metadata files that no longer exist on disk", () => {
    const existing = newMetadataFile({ id: 1, authorId: 1, relativePath: "author.opf" });
    const stillThere = newMetadataFile({ id: 2, authorId: 1, relativePath: "cover.jpg" });
    const metadataFileService: IMetadataFileService = {
      getFilesByAuthor: () => [existing, stillThere],
      getFilesByBookFile: () => [],
      findByPath: () => undefined,
      upsert: vi.fn(),
      upsertMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };

    const service = new CleanExtraFileService(metadataFileService, (path) =>
      path.endsWith("cover.jpg")
    );

    service.clean(makeAuthor());

    expect(metadataFileService.delete).toHaveBeenCalledWith(1);
    expect(metadataFileService.delete).not.toHaveBeenCalledWith(2);
  });

  it("does nothing when every file still exists on disk", () => {
    const existing = newMetadataFile({ id: 1, authorId: 1, relativePath: "author.opf" });
    const metadataFileService: IMetadataFileService = {
      getFilesByAuthor: () => [existing],
      getFilesByBookFile: () => [],
      findByPath: () => undefined,
      upsert: vi.fn(),
      upsertMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };

    const service = new CleanExtraFileService(metadataFileService, () => true);

    service.clean(makeAuthor());

    expect(metadataFileService.delete).not.toHaveBeenCalled();
  });
});
