import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { bookLookupController } from "../BookLookupController.js";
import type { Book } from "../../../../books/models.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";

function buildBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 0,
    authorMetadataId: 0,
    foreignBookId: "fb-1",
    titleSlug: "slug",
    title: "Some Book",
    releaseDate: null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "some book",
    monitored: false,
    anyEditionOk: false,
    lastInfoSync: null,
    added: null,
    addOptions: { addType: "Automatic" as never, searchForNewBook: false },
    ...overrides,
  };
}

function buildApp(deps: Parameters<typeof bookLookupController>[0]) {
  const app = express();
  app.use(express.json());
  app.use("/book/lookup", bookLookupController(deps));
  app.use(readarrErrorPipeline());
  return app;
}

describe("bookLookupController", () => {
  it("GET / searches by term and maps results, setting remoteCover from the Cover image", async () => {
    const searchForNewBook = vi.fn(async () => [buildBook()]);
    const convertToLocalUrls = vi.fn((_id: number, _entity: number, covers: { url: string }[]) => {
      for (const cover of covers) {
        cover.url = "local:" + cover.url;
      }
    });
    const app = buildApp({
      searchProxy: { searchForNewBook },
      coverMapper: { convertToLocalUrls },
    });

    const res = await request(app).get("/book/lookup").query("term=dune");

    expect(res.status).toBe(200);
    expect(searchForNewBook).toHaveBeenCalledWith("dune", null);
    expect(res.body).toHaveLength(1);
    // Never-added search results have id 0 -- must be stripped per
    // RestResource's id-omit-when-default convention.
    expect(res.body[0].id).toBeUndefined();
  });

  it("GET / with no term still calls the search proxy with an empty string", async () => {
    const searchForNewBook = vi.fn(async () => []);
    const app = buildApp({
      searchProxy: { searchForNewBook },
      coverMapper: { convertToLocalUrls: vi.fn() },
    });

    const res = await request(app).get("/book/lookup");

    expect(res.status).toBe(200);
    expect(searchForNewBook).toHaveBeenCalledWith("", null);
    expect(res.body).toEqual([]);
  });

  it("forwards search-proxy rejections to the error pipeline", async () => {
    const app = buildApp({
      searchProxy: {
        searchForNewBook: vi.fn(async () => {
          throw new Error("upstream metadata source is down");
        }),
      },
      coverMapper: { convertToLocalUrls: vi.fn() },
    });

    const res = await request(app).get("/book/lookup").query("term=dune");

    expect(res.status).toBe(500);
  });
});
