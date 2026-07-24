import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newBook, AuthorStatusType } from "../../../../books/models.js";
import type { Author, Book } from "../../../../books/models.js";
import { PagingSpec } from "../../../../db/paging-spec.js";
import { missingController, type MissingControllerOptions } from "../MissingController.js";

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
    metadata: {
      id: 1,
      foreignAuthorId: "fa-1",
      titleSlug: "author",
      name: "Author Name",
      nameLastFirst: "Name, Author",
      sortName: "author name",
      sortNameLastFirst: "name, author",
      aliases: [],
      overview: null,
      disambiguation: null,
      gender: null,
      hometown: null,
      born: null,
      died: null,
      status: AuthorStatusType.Ended,
      images: [],
      links: [],
      genres: [],
      ratings: { votes: 0, value: 0 },
    },
    ...overrides,
  };
}

function buildOptions(overrides: Partial<MissingControllerOptions> = {}): MissingControllerOptions {
  return {
    bookService: { booksWithoutFiles: (spec) => spec },
    authorLookup: { getAuthorByMetadataId: () => undefined },
    ...overrides,
  };
}

function buildApp(options: MissingControllerOptions) {
  const app = express();
  app.use(express.json());
  app.use("/wanted/missing", missingController(options));
  app.use(readarrErrorPipeline());
  return app;
}

describe("missingController", () => {
  it("GET / returns a paged envelope of missing books, pushing a Book.monitored=true filter by default", async () => {
    const books = [buildBook({ id: 1 }), buildBook({ id: 2 })];
    const author = buildAuthor({ id: 1, authorMetadataId: 1, monitored: true });
    const booksWithoutFiles = vi.fn((spec: PagingSpec<Book>) => {
      spec.records = books;
      spec.totalRecords = books.length;
      return spec;
    });
    const options = buildOptions({
      bookService: { booksWithoutFiles },
      authorLookup: { getAuthorByMetadataId: () => author },
    });
    const app = buildApp(options);

    const res = await request(app).get("/wanted/missing");

    expect(res.status).toBe(200);
    expect(res.body.totalRecords).toBe(2);
    expect(res.body.records).toHaveLength(2);

    const spec = booksWithoutFiles.mock.calls[0]?.[0] as PagingSpec<Book>;
    expect(spec.filterExpressions).toContainEqual({ field: "monitored", op: "eq", value: true });
  });

  it("pushes a Book.monitored=false filter when monitored=false", async () => {
    const booksWithoutFiles = vi.fn((spec: PagingSpec<Book>) => {
      spec.records = [];
      spec.totalRecords = 0;
      return spec;
    });
    const app = buildApp(buildOptions({ bookService: { booksWithoutFiles } }));

    await request(app).get("/wanted/missing?monitored=false");

    const spec = booksWithoutFiles.mock.calls[0]?.[0] as PagingSpec<Book>;
    expect(spec.filterExpressions).toContainEqual({ field: "monitored", op: "eq", value: false });
  });

  it("filters out books whose hydrated author's monitored flag doesn't match the requested monitored value", async () => {
    const monitoredBook = buildBook({ id: 1, authorMetadataId: 1 });
    const unmonitoredAuthorBook = buildBook({ id: 2, authorMetadataId: 2 });
    const books = [monitoredBook, unmonitoredAuthorBook];

    const options = buildOptions({
      bookService: {
        booksWithoutFiles: (spec) => {
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

    const res = await request(app).get("/wanted/missing?monitored=true");

    expect((res.body.records as { id: number }[]).map((r) => r.id)).toEqual([1]);
    // totalRecords still reflects the pre-Author-filter count -- ported caveat, see module doc comment.
    expect(res.body.totalRecords).toBe(2);
  });

  it("embeds author when includeAuthor=true", async () => {
    const book = buildBook({ id: 1, authorMetadataId: 1 });
    const author = buildAuthor({ authorMetadataId: 1, monitored: true });
    const options = buildOptions({
      bookService: {
        booksWithoutFiles: (spec) => {
          spec.records = [book];
          spec.totalRecords = 1;
          return spec;
        },
      },
      authorLookup: { getAuthorByMetadataId: () => author },
    });
    const app = buildApp(options);

    const res = await request(app).get("/wanted/missing?includeAuthor=true");

    expect(res.body.records[0].author).toBeDefined();
  });
});
