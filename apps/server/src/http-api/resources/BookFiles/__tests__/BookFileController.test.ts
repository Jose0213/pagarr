import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { ModelNotFoundException } from "../../../../db/errors.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { newQualityProfile } from "../../../../profiles/qualities/qualityProfile.js";
import type { BookFile } from "../../../../media-files-import/bookFile.js";
import { bookFileController, type BookFileControllerOptions } from "../BookFileController.js";

function makeBookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    id: 1,
    path: "/music/author/book/file.mp3",
    size: 1000,
    modified: new Date(0).toISOString(),
    dateAdded: new Date(0).toISOString(),
    originalFilePath: null,
    sceneName: null,
    releaseGroup: null,
    quality: newQualityModel(Quality.MP3),
    indexerFlags: 0,
    mediaInfo: null,
    editionId: 0,
    calibreId: 0,
    part: 0,
    partCount: 0,
    ...overrides,
  };
}

function makeOptions(
  overrides: Partial<BookFileControllerOptions> = {}
): BookFileControllerOptions {
  return {
    mediaFileService: {
      add: vi.fn(),
      addMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      getFilesByAuthor: vi.fn(() => []),
      getFilesByAuthorMetadataId: vi.fn(() => []),
      getFilesByBook: vi.fn(() => []),
      getFilesByEdition: vi.fn(() => []),
      getUnmappedFiles: vi.fn(() => []),
      filterUnchangedFiles: vi.fn((files) => files),
      get: vi.fn(() => makeBookFile()),
      getMany: vi.fn(() => []),
      getFilesWithBasePath: vi.fn(() => []),
      getFileWithPathList: vi.fn(() => []),
      getFileWithPath: vi.fn(),
      updateMediaInfo: vi.fn(),
      handleAuthorMoved: vi.fn(),
      handleBookDeleted: vi.fn(),
      handleRootFolderDeleted: vi.fn(),
    },
    mediaFileDeletionService: { deleteTrackFile: vi.fn() },
    metadataTagService: { readTags: vi.fn(() => null) },
    authorService: { getAuthor: vi.fn() },
    bookService: { getBook: vi.fn() },
    qualityProfileService: { get: vi.fn(() => newQualityProfile({ id: 1 })) },
    upgradableSpecification: { qualityCutoffNotMet: vi.fn(() => false) },
    ...overrides,
  };
}

function buildApp(options: BookFileControllerOptions) {
  const { router } = bookFileController(options);
  const app = express();
  app.use(express.json());
  app.use("/bookfile", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("bookFileController", () => {
  describe("GET /", () => {
    it("400s when no filter query param is provided", async () => {
      const app = buildApp(makeOptions());

      const res = await request(app).get("/bookfile");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        "authorId, bookId, bookFileIds or unmapped must be provided"
      );
    });

    it("returns unmapped files when unmapped=true", async () => {
      const bookFile = makeBookFile({ id: 5 });
      const options = makeOptions({
        mediaFileService: {
          ...makeOptions().mediaFileService,
          getUnmappedFiles: vi.fn(() => [bookFile]),
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/bookfile?unmapped=true");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(5);
    });

    it("returns files by authorId", async () => {
      const bookFile = makeBookFile({ id: 7, editionId: 0 });
      const author = { id: 42, qualityProfileId: 1 };
      const options = makeOptions({
        authorService: { getAuthor: vi.fn(() => author as never) },
        mediaFileService: {
          ...makeOptions().mediaFileService,
          getFilesByAuthor: vi.fn(() => [bookFile]),
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/bookfile?authorId=42");

      expect(res.status).toBe(200);
      expect(res.body[0].authorId).toBe(42);
    });

    it("returns files by bookId", async () => {
      const bookFile = makeBookFile({ id: 9 });
      const author = { id: 3, qualityProfileId: 1 };
      const options = makeOptions({
        bookService: { getBook: vi.fn(() => ({ id: 11, authorId: 3 })) },
        authorService: { getAuthor: vi.fn(() => author as never) },
        mediaFileService: {
          ...makeOptions().mediaFileService,
          getFilesByBook: vi.fn(() => [bookFile]),
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/bookfile?bookId=11");

      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe(9);
    });

    it("returns files by bookFileIds", async () => {
      const bookFile = makeBookFile({ id: 13 });
      const options = makeOptions({
        mediaFileService: {
          ...makeOptions().mediaFileService,
          getMany: vi.fn(() => [bookFile]),
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/bookfile?bookFileIds=13");

      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe(13);
    });
  });

  describe("GET /:id", () => {
    it("returns a resource with audioTags", async () => {
      const bookFile = makeBookFile({ id: 21 });
      const options = makeOptions({
        mediaFileService: { ...makeOptions().mediaFileService, get: vi.fn(() => bookFile) },
        metadataTagService: { readTags: vi.fn(() => null) },
      });
      const app = buildApp(options);

      const res = await request(app).get("/bookfile/21");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(21);
    });

    it("404s via ModelNotFoundException when the book file doesn't exist", async () => {
      const options = makeOptions({
        mediaFileService: {
          ...makeOptions().mediaFileService,
          get: vi.fn(() => {
            throw new ModelNotFoundException("BookFile", 999);
          }),
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/bookfile/999");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /:id", () => {
    it("updates quality and returns 202", async () => {
      const bookFile = makeBookFile({ id: 3 });
      const updateSpy = vi.fn();
      const options = makeOptions({
        mediaFileService: {
          ...makeOptions().mediaFileService,
          get: vi.fn(() => bookFile),
          update: updateSpy,
        },
      });
      const app = buildApp(options);

      const res = await request(app)
        .put("/bookfile/3")
        .send({ id: 3, quality: newQualityModel(Quality.FLAC) });

      expect(res.status).toBe(202);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(res.body.quality.quality.id).toBe(Quality.FLAC.id);
    });

    it("rejects id <= 0", async () => {
      const app = buildApp(makeOptions());

      const res = await request(app).put("/bookfile/0").send({ id: 0, quality: null });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /editor", () => {
    it("bulk-updates quality for the given bookFileIds", async () => {
      const author = { id: 1, qualityProfileId: 1 };
      const bookFile = makeBookFile({ id: 1, author: author as never });
      const updateManySpy = vi.fn();
      const options = makeOptions({
        mediaFileService: {
          ...makeOptions().mediaFileService,
          getMany: vi.fn(() => [bookFile]),
          updateMany: updateManySpy,
        },
      });
      const app = buildApp(options);

      const res = await request(app)
        .put("/bookfile/editor")
        .send({ bookFileIds: [1], quality: newQualityModel(Quality.EPUB) });

      expect(res.status).toBe(202);
      expect(updateManySpy).toHaveBeenCalledTimes(1);
      expect(res.body[0].authorId).toBe(1);
    });

    it("returns an empty array when no book files are found", async () => {
      const app = buildApp(makeOptions());

      const res = await request(app).put("/bookfile/editor").send({ bookFileIds: [] });

      expect(res.status).toBe(202);
      expect(res.body).toEqual([]);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a book file mapped to an edition via the author overload", async () => {
      const author = { id: 1, qualityProfileId: 1 };
      const bookFile = makeBookFile({ id: 4, editionId: 10, author: author as never });
      const deleteSpy = vi.fn();
      const options = makeOptions({
        mediaFileService: { ...makeOptions().mediaFileService, get: vi.fn(() => bookFile) },
        mediaFileDeletionService: { deleteTrackFile: deleteSpy },
      });
      const app = buildApp(options);

      const res = await request(app).delete("/bookfile/4");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(deleteSpy).toHaveBeenCalledWith(bookFile, author);
    });

    it("deletes an unmapped book file via the subfolder overload", async () => {
      const bookFile = makeBookFile({ id: 6, editionId: 0 });
      const deleteSpy = vi.fn();
      const options = makeOptions({
        mediaFileService: { ...makeOptions().mediaFileService, get: vi.fn(() => bookFile) },
        mediaFileDeletionService: { deleteTrackFile: deleteSpy },
      });
      const app = buildApp(options);

      const res = await request(app).delete("/bookfile/6");

      expect(res.status).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith(bookFile, null, "Unmapped_Files");
    });

    it("rejects id <= 0", async () => {
      const app = buildApp(makeOptions());

      const res = await request(app).delete("/bookfile/-1");

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /bulk", () => {
    it("deletes every book file in the list", async () => {
      const bookFileA = makeBookFile({ id: 1 });
      const bookFileB = makeBookFile({ id: 2 });
      const deleteSpy = vi.fn();
      const options = makeOptions({
        mediaFileService: {
          ...makeOptions().mediaFileService,
          getMany: vi.fn(() => [bookFileA, bookFileB]),
        },
        mediaFileDeletionService: { deleteTrackFile: deleteSpy },
      });
      const app = buildApp(options);

      const res = await request(app)
        .delete("/bookfile/bulk")
        .send({ bookFileIds: [1, 2] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(deleteSpy).toHaveBeenCalledTimes(2);
    });
  });
});
