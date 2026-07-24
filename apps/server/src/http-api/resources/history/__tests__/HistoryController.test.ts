import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newEntityHistory, EntityHistoryEventType } from "../../../../history/entityHistory.js";
import type { EntityHistory } from "../../../../history/entityHistory.js";
import { PagingSpec } from "../../../../db/paging-spec.js";
import { newBook } from "../../../../books/models.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { historyController, type HistoryControllerOptions } from "../HistoryController.js";

function buildHistory(overrides: Partial<EntityHistory> = {}): EntityHistory {
  return newEntityHistory({
    id: 1,
    bookId: 10,
    authorId: 20,
    sourceTitle: "Some.Book.Title",
    quality: newQualityModel(Quality.MP3_320),
    date: new Date().toISOString(),
    eventType: EntityHistoryEventType.Grabbed,
    data: {},
    downloadId: "dl-1",
    ...overrides,
  });
}

function buildOptions(overrides: Partial<HistoryControllerOptions> = {}): HistoryControllerOptions {
  return {
    historyService: {
      paged: (spec) => spec,
      mostRecentForBook: () => undefined,
      mostRecentForDownloadId: () => undefined,
      get: () => buildHistory(),
      getByAuthor: () => [],
      getByBook: () => [],
      find: () => [],
      findByDownloadId: () => [],
      findDownloadId: () => null,
      since: () => [],
      updateMany: () => {},
    },
    formatCalculator: { parseCustomFormatForHistory: () => [] } as never,
    upgradableSpecification: { qualityCutoffNotMet: () => false } as never,
    failedDownloadService: {
      markAsFailedByHistoryId: () => {},
      markAsFailedByDownloadId: () => {},
      check: () => {},
      processFailed: () => {},
    },
    authorService: {
      getAuthor: (id) => ({ id, authorMetadataId: id, cleanName: "author" }) as never,
    },
    resolveQualityProfile: () => undefined,
    ...overrides,
  };
}

function buildApp(options: HistoryControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/history", historyController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("historyController", () => {
  describe("GET /", () => {
    it("returns a paged envelope, defaulting to sortKey date descending", async () => {
      const records = [buildHistory({ id: 1 }), buildHistory({ id: 2 })];
      const options = buildOptions({
        historyService: {
          paged: (spec: PagingSpec<EntityHistory>) => {
            spec.records = records;
            spec.totalRecords = records.length;
            return spec;
          },
          mostRecentForBook: () => undefined,
          mostRecentForDownloadId: () => undefined,
          get: () => buildHistory(),
          getByAuthor: () => [],
          getByBook: () => [],
          find: () => [],
          findByDownloadId: () => [],
          findDownloadId: () => null,
          since: () => [],
          updateMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/history");

      expect(res.status).toBe(200);
      expect(res.body.sortKey).toBe("date");
      expect(res.body.sortDirection).toBe("Descending");
      expect(res.body.totalRecords).toBe(2);
      expect(res.body.records).toHaveLength(2);
    });

    it("pushes an eventType IN filter when eventType query params are given", async () => {
      const pagedSpy = vi.fn((spec: PagingSpec<EntityHistory>) => {
        spec.records = [];
        spec.totalRecords = 0;
        return spec;
      });
      const options = buildOptions({
        historyService: {
          paged: pagedSpy,
          mostRecentForBook: () => undefined,
          mostRecentForDownloadId: () => undefined,
          get: () => buildHistory(),
          getByAuthor: () => [],
          getByBook: () => [],
          find: () => [],
          findByDownloadId: () => [],
          findDownloadId: () => null,
          since: () => [],
          updateMany: () => {},
        },
      });
      const app = buildApp(options);

      await request(app).get("/history?eventType=1&eventType=4");

      const spec = pagedSpy.mock.calls[0]?.[0] as PagingSpec<EntityHistory>;
      expect(spec.filterExpressions).toContainEqual({
        field: "eventType",
        op: "in",
        value: [1, 4],
      });
    });

    it("embeds author/book when includeAuthor/includeBook are set", async () => {
      const record = buildHistory({
        id: 1,
        book: { ...newBook(), id: 10, title: "T" },
      });
      const options = buildOptions({
        authorService: {
          getAuthor: (id) =>
            ({
              id,
              authorMetadataId: id,
              cleanName: "author",
              metadata: { id, name: "Author Name", nameLastFirst: "Name, Author" },
            }) as never,
        },
        historyService: {
          paged: (spec: PagingSpec<EntityHistory>) => {
            spec.records = [record];
            spec.totalRecords = 1;
            return spec;
          },
          mostRecentForBook: () => undefined,
          mostRecentForDownloadId: () => undefined,
          get: () => buildHistory(),
          getByAuthor: () => [],
          getByBook: () => [],
          find: () => [],
          findByDownloadId: () => [],
          findDownloadId: () => null,
          since: () => [],
          updateMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/history?includeAuthor=true&includeBook=true");

      expect(res.body.records[0].author).toBeDefined();
      expect(res.body.records[0].book).toBeDefined();
    });
  });

  describe("GET /since", () => {
    it("returns history since the given date", async () => {
      const since = vi.fn().mockReturnValue([buildHistory({ id: 1 })]);
      const options = buildOptions({
        historyService: {
          paged: (spec) => spec,
          mostRecentForBook: () => undefined,
          mostRecentForDownloadId: () => undefined,
          get: () => buildHistory(),
          getByAuthor: () => [],
          getByBook: () => [],
          find: () => [],
          findByDownloadId: () => [],
          findDownloadId: () => null,
          since,
          updateMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/history/since?date=2024-01-01");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(since).toHaveBeenCalled();
    });
  });

  describe("GET /author", () => {
    it("returns history by author (no bookId)", async () => {
      const getByAuthor = vi.fn().mockReturnValue([buildHistory({ id: 1, authorId: 7 })]);
      const options = buildOptions({
        historyService: {
          paged: (spec) => spec,
          mostRecentForBook: () => undefined,
          mostRecentForDownloadId: () => undefined,
          get: () => buildHistory(),
          getByAuthor,
          getByBook: () => [],
          find: () => [],
          findByDownloadId: () => [],
          findDownloadId: () => null,
          since: () => [],
          updateMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/history/author?authorId=7");

      expect(res.status).toBe(200);
      expect(getByAuthor).toHaveBeenCalledWith(7, null);
    });

    it("returns history by book when bookId is given", async () => {
      const getByBook = vi.fn().mockReturnValue([buildHistory({ id: 1 })]);
      const options = buildOptions({
        historyService: {
          paged: (spec) => spec,
          mostRecentForBook: () => undefined,
          mostRecentForDownloadId: () => undefined,
          get: () => buildHistory(),
          getByAuthor: () => [],
          getByBook,
          find: () => [],
          findByDownloadId: () => [],
          findDownloadId: () => null,
          since: () => [],
          updateMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/history/author?authorId=7&bookId=99");

      expect(res.status).toBe(200);
      expect(getByBook).toHaveBeenCalledWith(99, null);
    });
  });

  describe("POST /failed/:id", () => {
    it("marks the history entry as failed and returns {}", async () => {
      const markAsFailedByHistoryId = vi.fn();
      const options = buildOptions({
        failedDownloadService: {
          markAsFailedByHistoryId,
          markAsFailedByDownloadId: () => {},
          check: () => {},
          processFailed: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).post("/history/failed/42");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(markAsFailedByHistoryId).toHaveBeenCalledWith(42);
    });
  });
});
