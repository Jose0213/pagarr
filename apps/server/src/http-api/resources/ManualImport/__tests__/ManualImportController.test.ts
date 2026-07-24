import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { Revision } from "../../../../qualities/revision.js";
import { newBook } from "../../../../books/index.js";
import {
  newManualImportItem,
  type ManualImportItem,
} from "../../../../media-files-import/bookImport/manual/manualImportItem.js";
import {
  manualImportController,
  type ManualImportControllerOptions,
} from "../ManualImportController.js";

function makeOptions(
  overrides: Partial<ManualImportControllerOptions> = {}
): ManualImportControllerOptions {
  return {
    manualImportService: {
      getMediaFiles: vi.fn(async () => []),
      updateItems: vi.fn(async (items: ManualImportItem[]) => items),
    },
    authorService: { getAuthor: vi.fn() },
    bookService: { getBook: vi.fn() },
    editionService: { getEditionByForeignEditionId: vi.fn() },
    ...overrides,
  };
}

function buildApp(options: ManualImportControllerOptions) {
  const router = manualImportController(options);
  const app = express();
  app.use(express.json());
  app.use("/manualimport", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("manualImportController", () => {
  describe("GET /", () => {
    it("passes query params through to the service and returns resources", async () => {
      const getMediaFiles = vi.fn(async () => [
        { ...newManualImportItem(), id: 1, path: "/a.mp3" },
      ]);
      const options = makeOptions({ manualImportService: { getMediaFiles, updateItems: vi.fn() } });
      const app = buildApp(options);

      const res = await request(app).get("/manualimport?folder=%2Fmusic&downloadId=abc");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(getMediaFiles).toHaveBeenCalledWith("/music", "abc", null, "Matched", true);
    });

    it("resolves the author when authorId > 0 is supplied", async () => {
      const author = { id: 4 };
      const getAuthor = vi.fn(() => author as never);
      const getMediaFiles = vi.fn(async () => []);
      const options = makeOptions({
        authorService: { getAuthor },
        manualImportService: { getMediaFiles, updateItems: vi.fn() },
      });
      const app = buildApp(options);

      await request(app).get("/manualimport?folder=%2Fmusic&authorId=4");

      expect(getAuthor).toHaveBeenCalledWith(4);
      expect(getMediaFiles).toHaveBeenCalledWith("/music", null, author, "Matched", true);
    });

    it("uses FilterFilesType.None when filterExistingFiles=false", async () => {
      const getMediaFiles = vi.fn(async () => []);
      const options = makeOptions({ manualImportService: { getMediaFiles, updateItems: vi.fn() } });
      const app = buildApp(options);

      await request(app).get("/manualimport?folder=%2Fmusic&filterExistingFiles=false");

      expect(getMediaFiles).toHaveBeenCalledWith("/music", null, null, "None", true);
    });

    it("computes qualityWeight for items with a quality set", async () => {
      const quality = newQualityModel(Quality.FLAC, new Revision({ version: 1, real: 2 }));
      const getMediaFiles = vi.fn(async () => [{ ...newManualImportItem(), id: 1, quality }]);
      const options = makeOptions({ manualImportService: { getMediaFiles, updateItems: vi.fn() } });
      const app = buildApp(options);

      const res = await request(app).get("/manualimport?folder=%2Fmusic");

      // FLAC weight 110 + real(2)*10 + version(1) = 131.
      expect(res.body[0].qualityWeight).toBe(131);
    });
  });

  describe("POST /", () => {
    it("converts resources to ManualImportItems, calls updateItems, and returns 202", async () => {
      const author = { id: 1, authorMetadataId: 1, metadata: { id: 1, name: "Author One" } };
      const book = { ...newBook(), id: 2, title: "Book Two" };
      const updateItems = vi.fn(async (items: ManualImportItem[]) => items);
      const options = makeOptions({
        authorService: { getAuthor: vi.fn(() => author as never) },
        bookService: { getBook: vi.fn(() => book as never) },
        manualImportService: { getMediaFiles: vi.fn(), updateItems },
      });
      const app = buildApp(options);

      const res = await request(app)
        .post("/manualimport")
        .send([{ id: 1, path: "/a.mp3", name: "a", authorId: 1, bookId: 2 }]);

      expect(res.status).toBe(202);
      expect(updateItems).toHaveBeenCalledTimes(1);
      const passedItems = updateItems.mock.calls[0]![0];
      expect(passedItems[0]!.author).toBe(author);
      expect(passedItems[0]!.book).toBe(book);
      expect(res.body[0].id).toBe(1);
    });

    it("leaves author/book undefined when authorId/bookId aren't provided", async () => {
      const updateItems = vi.fn(async (items: ManualImportItem[]) => items);
      const options = makeOptions({ manualImportService: { getMediaFiles: vi.fn(), updateItems } });
      const app = buildApp(options);

      await request(app)
        .post("/manualimport")
        .send([{ id: 1, path: "/a.mp3", name: "a" }]);

      const passedItems = updateItems.mock.calls[0]![0];
      expect(passedItems[0]!.author).toBeUndefined();
      expect(passedItems[0]!.book).toBeUndefined();
    });
  });
});
