import { describe, expect, it, vi } from "vitest";
import { ExtraFileService } from "../extraFileService.js";
import type { IExtraFileRepository } from "../extraFileRepository.js";
import type { AuthorService } from "../../books/authorService.js";
import { DeleteMediaFileReason, type RecycleBinProviderLike } from "../forwardRefs.js";
import { newOtherExtraFile, type OtherExtraFile } from "../others/otherExtraFile.js";

function makeFakeRepository(initial: OtherExtraFile[] = []): IExtraFileRepository<OtherExtraFile> {
  let rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  return {
    all: () => rows.map((r) => ({ ...r })),
    find: (id) => rows.find((r) => r.id === id),
    get: (id) => {
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error("not found");
      return { ...found };
    },
    getMany: (ids) => rows.filter((r) => ids.includes(r.id)),
    insert: (model) => {
      const inserted = { ...model, id: nextId++ };
      rows.push(inserted);
      return inserted;
    },
    insertMany: (models) =>
      models.map((m) => ({ ...m, id: nextId++ })).map((m) => (rows.push(m), m)),
    update: (model) => {
      rows = rows.map((r) => (r.id === model.id ? { ...model } : r));
      return model;
    },
    updateMany: (models) => {
      for (const m of models) {
        rows = rows.map((r) => (r.id === m.id ? { ...m } : r));
      }
    },
    upsert: (model) => (model.id === 0 ? { ...model, id: nextId++ } : model),
    delete: (id) => {
      rows = rows.filter((r) => r.id !== id);
    },
    deleteMany: (ids) => {
      rows = rows.filter((r) => !ids.includes(r.id));
    },
    count: () => rows.length,
    hasItems: () => rows.length > 0,
    deleteForAuthor: (authorId) => {
      rows = rows.filter((r) => r.authorId !== authorId);
    },
    deleteForBook: (authorId, bookId) => {
      rows = rows.filter((r) => !(r.authorId === authorId && r.bookId === bookId));
    },
    deleteForBookFile: (bookFileId) => {
      rows = rows.filter((r) => r.bookFileId !== bookFileId);
    },
    getFilesByAuthor: (authorId) => rows.filter((r) => r.authorId === authorId),
    getFilesByBook: (authorId, bookId) =>
      rows.filter((r) => r.authorId === authorId && r.bookId === bookId),
    getFilesByBookFile: (bookFileId) => rows.filter((r) => r.bookFileId === bookFileId),
    findByPath: (authorId, path) =>
      rows.find((r) => r.authorId === authorId && r.relativePath === path),
  };
}

const fakeAuthorService = {} as AuthorService;

describe("ExtraFileService.upsertMany", () => {
  it("stamps Added and LastUpdated on brand-new rows (id === 0)", () => {
    const repo = makeFakeRepository();
    const recycleBin: RecycleBinProviderLike = { deleteFile: vi.fn() };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin);

    const file = newOtherExtraFile({ authorId: 1, relativePath: "a.jpg" });
    service.upsert(file);

    expect(file.added).not.toBe("");
    expect(file.lastUpdated).not.toBe("");
    expect(repo.getFilesByAuthor(1)).toHaveLength(1);
  });

  it("only updates LastUpdated (not Added) for already-persisted rows", () => {
    const repo = makeFakeRepository();
    const recycleBin: RecycleBinProviderLike = { deleteFile: vi.fn() };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin);

    const file = newOtherExtraFile({ authorId: 1, relativePath: "a.jpg" });
    service.upsert(file);
    const originalAdded = file.added;

    const existing = newOtherExtraFile({
      id: 1,
      authorId: 1,
      relativePath: "a.jpg",
      added: originalAdded,
    });
    service.upsert(existing);

    expect(existing.added).toBe(originalAdded);
  });

  it("splits a mixed batch into inserts (id===0) and updates (id>0)", () => {
    const repo = makeFakeRepository([
      newOtherExtraFile({ id: 1, authorId: 1, relativePath: "existing.jpg" }),
    ]);
    const recycleBin: RecycleBinProviderLike = { deleteFile: vi.fn() };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin);

    const newFile = newOtherExtraFile({ authorId: 1, relativePath: "new.jpg" });
    const existingFile = { ...repo.getFilesByAuthor(1)[0]!, relativePath: "renamed.jpg" };

    service.upsertMany([newFile, existingFile]);

    const all = repo.getFilesByAuthor(1);
    expect(all).toHaveLength(2);
    expect(all.some((f) => f.relativePath === "renamed.jpg")).toBe(true);
    expect(all.some((f) => f.relativePath === "new.jpg")).toBe(true);
  });
});

describe("ExtraFileService.handleAuthorDeleted", () => {
  it("deletes every extra file row for that author", () => {
    const repo = makeFakeRepository([
      newOtherExtraFile({ id: 1, authorId: 1, relativePath: "a.jpg" }),
      newOtherExtraFile({ id: 2, authorId: 2, relativePath: "b.jpg" }),
    ]);
    const recycleBin: RecycleBinProviderLike = { deleteFile: vi.fn() };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin);

    service.handleAuthorDeleted(1);

    expect(repo.getFilesByAuthor(1)).toHaveLength(0);
    expect(repo.getFilesByAuthor(2)).toHaveLength(1);
  });
});

describe("ExtraFileService.handleBookFileDeleted", () => {
  it("recycles on-disk extra files and deletes their DB rows for NON-cleanup reasons", () => {
    const repo = makeFakeRepository([
      newOtherExtraFile({ id: 1, authorId: 1, bookFileId: 5, relativePath: "a.jpg" }),
    ]);
    const deleteFile = vi.fn();
    const recycleBin: RecycleBinProviderLike = { deleteFile };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin, {
      fileExists: () => true,
    });

    service.handleBookFileDeleted(
      {
        bookFile: { id: 5, path: "/books/author/book/file.epub", editionId: 1 },
        reason: DeleteMediaFileReason.Manual,
      },
      { path: "/books/author" }
    );

    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(repo.getFilesByBookFile(5)).toHaveLength(0);
  });

  it("does NOT recycle files for NoLinkedEpisodes (cleanup routine), but still deletes DB rows", () => {
    const repo = makeFakeRepository([
      newOtherExtraFile({ id: 1, authorId: 1, bookFileId: 5, relativePath: "a.jpg" }),
    ]);
    const deleteFile = vi.fn();
    const recycleBin: RecycleBinProviderLike = { deleteFile };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin, {
      fileExists: () => true,
    });

    service.handleBookFileDeleted(
      {
        bookFile: { id: 5, path: "/books/author/book/file.epub", editionId: 1 },
        reason: DeleteMediaFileReason.NoLinkedEpisodes,
      },
      { path: "/books/author" }
    );

    expect(deleteFile).not.toHaveBeenCalled();
    expect(repo.getFilesByBookFile(5)).toHaveLength(0);
  });

  it("does not recycle a file that no longer exists on disk", () => {
    const repo = makeFakeRepository([
      newOtherExtraFile({ id: 1, authorId: 1, bookFileId: 5, relativePath: "a.jpg" }),
    ]);
    const deleteFile = vi.fn();
    const recycleBin: RecycleBinProviderLike = { deleteFile };
    const service = new ExtraFileService(repo, fakeAuthorService, recycleBin, {
      fileExists: () => false,
    });

    service.handleBookFileDeleted(
      {
        bookFile: { id: 5, path: "/books/author/book/file.epub", editionId: 1 },
        reason: DeleteMediaFileReason.Manual,
      },
      { path: "/books/author" }
    );

    expect(deleteFile).not.toHaveBeenCalled();
    expect(repo.getFilesByBookFile(5)).toHaveLength(0);
  });
});
