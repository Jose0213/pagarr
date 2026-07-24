import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newAuthor, newAuthorMetadata, newBook, newEdition } from "../../../../books/models.js";
import { MediaCoverEntity } from "../../../../media-cover/mediaCover.js";
import type { IMapCoversToLocal } from "../../../../media-cover/mediaCoverService.js";
import type {
  ISearchForNewEntity,
  NewEntitySearchResult,
} from "../../../../metadata-source/interfaces.js";
import { searchController, type AuthorFolderBuilder } from "../SearchController.js";

function buildApp(results: NewEntitySearchResult[]) {
  const searchProxy: ISearchForNewEntity = {
    searchForNewEntity: vi.fn(async () => results),
  };
  const fileNameBuilder: AuthorFolderBuilder = {
    getAuthorFolder: vi.fn(() => "/books/Author Name"),
  };
  const coverMapper: IMapCoversToLocal = {
    convertToLocalUrls: vi.fn((_id, _entity, covers) => {
      for (const cover of covers) {
        cover.url = `/local${cover.url}`;
      }
    }),
    getCoverPath: vi.fn(() => ""),
    ensureBookCovers: vi.fn(async () => {}),
  };

  const router = searchController({ searchProxy, fileNameBuilder, coverMapper });

  const app = express();
  app.use(express.json());
  app.use("/search", router);
  app.use(readarrErrorPipeline());

  return { app, searchProxy, fileNameBuilder, coverMapper };
}

describe("searchController", () => {
  it("GET /?term=... maps an author result with a sequential id", async () => {
    const author = {
      ...newAuthor(),
      id: 3,
      metadata: {
        ...newAuthorMetadata(),
        id: 3,
        name: "Some Author",
        foreignAuthorId: "fa-1",
        images: [{ coverType: "Poster", url: "/poster.jpg", remoteUrl: "https://x/poster.jpg" }],
      },
    };

    const ctx = buildApp([{ type: "author", author } as never]);

    const res = await request(ctx.app).get("/search?term=some");

    expect(res.status).toBe(200);
    expect(ctx.searchProxy.searchForNewEntity).toHaveBeenCalledWith("some");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(1);
    expect(res.body[0].foreignId).toBe("fa-1");
    expect(res.body[0].author.authorName).toBe("Some Author");
    expect(res.body[0].author.remotePoster).toBe("https://x/poster.jpg");
    expect(res.body[0].author.folder).toBe("/books/Author Name");
  });

  it("GET /?term=... maps a book result, throwing is avoided when exactly one edition is monitored", async () => {
    const author = {
      ...newAuthor(),
      id: 4,
      metadata: { ...newAuthorMetadata(), id: 4, name: "Book Author" },
    };
    const book = {
      ...newBook(),
      id: 8,
      title: "Some Book",
      foreignBookId: "fb-1",
      author,
      editions: [{ ...newEdition(), id: 1, bookId: 8, monitored: true, overview: "The overview" }],
    };

    const ctx = buildApp([{ type: "book", book } as never]);

    const res = await request(ctx.app).get("/search?term=some");

    expect(res.status).toBe(200);
    expect(res.body[0].book.overview).toBe("The overview");
    expect(res.body[0].book.author.authorName).toBe("Book Author");
    expect(res.body[0].foreignId).toBe("fb-1");
  });

  it("assigns 1-based sequential ids across mixed author/book results", async () => {
    const author = {
      ...newAuthor(),
      id: 1,
      metadata: { ...newAuthorMetadata(), id: 1, name: "A" },
    };
    const book = {
      ...newBook(),
      id: 2,
      title: "B",
      foreignBookId: "fb-2",
      author,
      editions: [{ ...newEdition(), id: 2, bookId: 2, monitored: true, overview: "" }],
    };

    const ctx = buildApp([{ type: "author", author } as never, { type: "book", book } as never]);

    const res = await request(ctx.app).get("/search?term=x");

    const ids = (res.body as { id: number }[]).map((r) => r.id);
    expect(ids).toEqual([1, 2]);
  });

  it("throws (500 via error pipeline) when a book has zero monitored editions", async () => {
    const author = {
      ...newAuthor(),
      id: 5,
      metadata: { ...newAuthorMetadata(), id: 5, name: "C" },
    };
    const book = {
      ...newBook(),
      id: 3,
      title: "No Monitored",
      foreignBookId: "fb-3",
      author,
      editions: [{ ...newEdition(), id: 3, bookId: 3, monitored: false, overview: "" }],
    };

    const ctx = buildApp([{ type: "book", book } as never]);

    const res = await request(ctx.app).get("/search?term=x");

    expect(res.status).toBe(500);
  });

  it("uses an empty term when ?term= is absent", async () => {
    const ctx = buildApp([]);

    const res = await request(ctx.app).get("/search");

    expect(res.status).toBe(200);
    expect(ctx.searchProxy.searchForNewEntity).toHaveBeenCalledWith("");
    expect(res.body).toEqual([]);
  });

  it("converts local cover URLs via coverMapper for authors", async () => {
    const author = {
      ...newAuthor(),
      id: 6,
      metadata: {
        ...newAuthorMetadata(),
        id: 6,
        name: "D",
        images: [{ coverType: "Poster", url: "/orig.jpg" }],
      },
    };

    const ctx = buildApp([{ type: "author", author } as never]);

    await request(ctx.app).get("/search?term=x");

    // `_coverMapper.ConvertToLocalUrls(resource.Author.Id, ...)` in the real
    // source -- keyed by the AUTHOR's own id, not the outer SearchResource's
    // synthetic sequential id.
    expect(ctx.coverMapper.convertToLocalUrls).toHaveBeenCalledWith(
      6,
      MediaCoverEntity.Author,
      expect.any(Array)
    );
  });
});
