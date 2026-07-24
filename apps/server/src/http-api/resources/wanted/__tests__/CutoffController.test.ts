import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newBook } from "../../../../books/models.js";
import type { Author, Book } from "../../../../books/models.js";
import { PagingSpec } from "../../../../db/paging-spec.js";
import { cutoffController, type CutoffControllerOptions } from "../CutoffController.js";

function buildBook(overrides: Partial<Book> = {}): Book {
  return {
    ...newBook(),
    id: 1,
    authorMetadataId: 1,
    title: "A Book",
    monitored: true,
    ...overrides,
  };
}

function buildAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 1,
    cleanName: "author",
    monitored: true,
    monitorNewItems: 0,
    lastInfoSync: null,
    path: "",
    rootFolderPath: "",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    ...overrides,
  };
}

function buildOptions(overrides: Partial<CutoffControllerOptions> = {}): CutoffControllerOptions {
  return {
    bookCutoffService: { booksWhereCutoffUnmet: (spec) => spec },
    authorLookup: { getAuthorByMetadataId: () => undefined },
    ...overrides,
  };
}

function buildApp(options: CutoffControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/wanted/cutoff", cutoffController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("cutoffController", () => {
  it("GET / returns a paged envelope of cutoff-unmet books, pushing a Book.monitored=true filter by default", async () => {
    const books = [buildBook({ id: 1 }), buildBook({ id: 2 })];
    const author = buildAuthor({ id: 1, authorMetadataId: 1, monitored: true });
    const booksWhereCutoffUnmet = vi.fn((spec: PagingSpec<Book>) => {
      spec.records = books;
      spec.totalRecords = books.length;
      return spec;
    });
    const options = buildOptions({
      bookCutoffService: { booksWhereCutoffUnmet },
      authorLookup: { getAuthorByMetadataId: () => author },
    });
    const app = buildApp(options);

    const res = await request(app).get("/wanted/cutoff");

    expect(res.status).toBe(200);
    expect(res.body.totalRecords).toBe(2);
    expect(res.body.records).toHaveLength(2);

    const spec = booksWhereCutoffUnmet.mock.calls[0]?.[0] as PagingSpec<Book>;
    expect(spec.filterExpressions).toContainEqual({ field: "monitored", op: "eq", value: true });
  });

  it("pushes a Book.monitored=false filter when monitored=false", async () => {
    const booksWhereCutoffUnmet = vi.fn((spec: PagingSpec<Book>) => {
      spec.records = [];
      spec.totalRecords = 0;
      return spec;
    });
    const app = buildApp(buildOptions({ bookCutoffService: { booksWhereCutoffUnmet } }));

    await request(app).get("/wanted/cutoff?monitored=false");

    const spec = booksWhereCutoffUnmet.mock.calls[0]?.[0] as PagingSpec<Book>;
    expect(spec.filterExpressions).toContainEqual({ field: "monitored", op: "eq", value: false });
  });

  it("filters out books whose hydrated author's monitored flag doesn't match the requested monitored value", async () => {
    const monitoredBook = buildBook({ id: 1, authorMetadataId: 1 });
    const unmonitoredAuthorBook = buildBook({ id: 2, authorMetadataId: 2 });
    const books = [monitoredBook, unmonitoredAuthorBook];

    const options = buildOptions({
      bookCutoffService: {
        booksWhereCutoffUnmet: (spec) => {
          spec.records = books;
          spec.totalRecords = books.length;
          return spec;
        },
      },
      authorLookup: {
        getAuthorByMetadataId: (id) =>
          id === 1
            ? buildAuthor({ authorMetadataId: 1, monitored: true })
            : buildAuthor({ authorMetadataId: 2, monitored: false }),
      },
    });
    const app = buildApp(options);

    const res = await request(app).get("/wanted/cutoff?monitored=true");

    expect((res.body.records as { id: number }[]).map((r) => r.id)).toEqual([1]);
  });
});
