import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newBlocklist } from "../../../../blocklisting/blocklist.js";
import type { Blocklist } from "../../../../blocklisting/blocklist.js";
import { PagingSpec } from "../../../../db/paging-spec.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { blocklistController, type BlocklistControllerOptions } from "../BlocklistController.js";

function buildBlocklistItem(overrides: Partial<Blocklist> = {}): Blocklist {
  return newBlocklist({
    id: 1,
    authorId: 5,
    bookIds: [10, 11],
    sourceTitle: "Some.Book",
    quality: newQualityModel(Quality.MP3_320),
    date: new Date().toISOString(),
    ...overrides,
  });
}

function buildOptions(
  overrides: Partial<BlocklistControllerOptions> = {}
): BlocklistControllerOptions {
  return {
    blocklistService: {
      blocklisted: () => false,
      blocklistedTorrentHash: () => false,
      paged: (spec) => spec,
      block: () => {},
      delete: () => {},
      deleteMany: () => {},
    },
    formatCalculator: { parseCustomFormatForBlocklist: () => [] } as never,
    authorService: {
      getAuthor: (id) =>
        ({
          id,
          authorMetadataId: id,
          cleanName: "author",
          metadata: { id, name: "Author Name", nameLastFirst: "Name, Author" },
        }) as never,
    },
    ...overrides,
  };
}

function buildApp(options: BlocklistControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/blocklist", blocklistController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("blocklistController", () => {
  describe("GET /", () => {
    it("returns a paged envelope, defaulting to sortKey date descending", async () => {
      const records = [buildBlocklistItem({ id: 1 }), buildBlocklistItem({ id: 2 })];
      const options = buildOptions({
        blocklistService: {
          blocklisted: () => false,
          blocklistedTorrentHash: () => false,
          paged: (spec: PagingSpec<Blocklist>) => {
            spec.records = records;
            spec.totalRecords = records.length;
            return spec;
          },
          block: () => {},
          delete: () => {},
          deleteMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).get("/blocklist");

      expect(res.status).toBe(200);
      expect(res.body.sortKey).toBe("date");
      expect(res.body.sortDirection).toBe("Descending");
      expect(res.body.totalRecords).toBe(2);
      expect(res.body.records).toHaveLength(2);
      expect(res.body.records[0].author).toBeDefined();
    });

    it("resolves the author via authorService when the row's author is unpopulated", async () => {
      const record = buildBlocklistItem({ id: 1, authorId: 42 });
      const getAuthor = vi.fn().mockReturnValue({
        id: 42,
        authorMetadataId: 42,
        cleanName: "x",
        metadata: { id: 42, name: "X", nameLastFirst: "X" },
      });
      const options = buildOptions({
        blocklistService: {
          blocklisted: () => false,
          blocklistedTorrentHash: () => false,
          paged: (spec: PagingSpec<Blocklist>) => {
            spec.records = [record];
            spec.totalRecords = 1;
            return spec;
          },
          block: () => {},
          delete: () => {},
          deleteMany: () => {},
        },
        authorService: { getAuthor },
      });
      const app = buildApp(options);

      await request(app).get("/blocklist");

      expect(getAuthor).toHaveBeenCalledWith(42);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes and returns {}", async () => {
      const deleteFn = vi.fn();
      const options = buildOptions({
        blocklistService: {
          blocklisted: () => false,
          blocklistedTorrentHash: () => false,
          paged: (spec) => spec,
          block: () => {},
          delete: deleteFn,
          deleteMany: () => {},
        },
      });
      const app = buildApp(options);

      const res = await request(app).delete("/blocklist/7");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(deleteFn).toHaveBeenCalledWith(7);
    });

    it("400s for a non-positive id", async () => {
      const app = buildApp(buildOptions());

      const res = await request(app).delete("/blocklist/0");

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /bulk", () => {
    it("deletes many and returns {}", async () => {
      const deleteMany = vi.fn();
      const options = buildOptions({
        blocklistService: {
          blocklisted: () => false,
          blocklistedTorrentHash: () => false,
          paged: (spec) => spec,
          block: () => {},
          delete: () => {},
          deleteMany,
        },
      });
      const app = buildApp(options);

      const res = await request(app)
        .delete("/blocklist/bulk")
        .send({ ids: [1, 2, 3] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(deleteMany).toHaveBeenCalledWith([1, 2, 3]);
    });
  });
});
