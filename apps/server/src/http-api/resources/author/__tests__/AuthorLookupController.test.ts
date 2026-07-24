import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AuthorStatusType, NewItemMonitorTypes, type Author } from "../../../../books/index.js";
import type { IMapCoversToLocal } from "../../../../media-cover/index.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { authorLookupController } from "../AuthorLookupController.js";

function makeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 0,
    authorMetadataId: 0,
    cleanName: "stephenking",
    monitored: false,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "",
    rootFolderPath: "",
    added: null,
    qualityProfileId: 0,
    metadataProfileId: 0,
    tags: [],
    metadata: {
      id: 0,
      foreignAuthorId: "fa-1",
      titleSlug: "stephen-king",
      name: "Stephen King",
      sortName: "king stephen",
      nameLastFirst: "King, Stephen",
      sortNameLastFirst: "king stephen",
      aliases: [],
      overview: null,
      disambiguation: null,
      gender: null,
      hometown: null,
      born: null,
      died: null,
      status: AuthorStatusType.Continuing,
      images: [
        { coverType: "Poster", url: "/local.jpg", remoteUrl: "https://remote/poster.jpg" },
        { coverType: "Banner", url: "/local-banner.jpg" },
      ],
      links: [],
      genres: [],
      ratings: { votes: 0, value: 0 },
    },
    ...overrides,
  };
}

function makeCoverMapper(): IMapCoversToLocal {
  return {
    convertToLocalUrls: vi.fn(),
    getCoverPath: vi.fn(() => ""),
    ensureBookCovers: vi.fn(async () => {}),
  };
}

function buildApp(
  searchForNewAuthor: (title: string) => Promise<Author[]>,
  coverMapper: IMapCoversToLocal,
  getAuthorFolder?: (author: Author) => string
) {
  const router = authorLookupController({
    searchProxy: { searchForNewAuthor },
    coverMapper,
    ...(getAuthorFolder ? { getAuthorFolder } : {}),
  });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/author/lookup", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("authorLookupController", () => {
  it("GET / searches via the injected proxy and maps results to resources", async () => {
    const author = makeAuthor();
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => [author]);
    const app = buildApp(searchForNewAuthor, coverMapper);

    const res = await request(app).get("/api/v1/author/lookup").query({ term: "Stephen King" });

    expect(res.status).toBe(200);
    expect(searchForNewAuthor).toHaveBeenCalledWith("Stephen King");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].authorName).toBe("Stephen King");
    expect(coverMapper.convertToLocalUrls).toHaveBeenCalled();
  });

  it("sets remotePoster from the first Poster-type image", async () => {
    const author = makeAuthor();
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => [author]);
    const app = buildApp(searchForNewAuthor, coverMapper);

    const res = await request(app).get("/api/v1/author/lookup").query({ term: "x" });

    expect(res.body[0].remotePoster).toBe("https://remote/poster.jpg");
  });

  it("leaves remotePoster null when there is no Poster-type image", async () => {
    const author = makeAuthor();
    author.metadata!.images = [{ coverType: "Banner", url: "/b.jpg" }];
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => [author]);
    const app = buildApp(searchForNewAuthor, coverMapper);

    const res = await request(app).get("/api/v1/author/lookup").query({ term: "x" });

    expect(res.body[0].remotePoster).toBeNull();
  });

  it("populates folder via getAuthorFolder when supplied", async () => {
    const author = makeAuthor();
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => [author]);
    const app = buildApp(searchForNewAuthor, coverMapper, () => "Stephen King");

    const res = await request(app).get("/api/v1/author/lookup").query({ term: "x" });

    expect(res.body[0].folder).toBe("Stephen King");
  });

  it("leaves folder null when getAuthorFolder is not supplied", async () => {
    const author = makeAuthor();
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => [author]);
    const app = buildApp(searchForNewAuthor, coverMapper);

    const res = await request(app).get("/api/v1/author/lookup").query({ term: "x" });

    expect(res.body[0].folder).toBeNull();
  });

  it("passes an empty term through when the query param is absent", async () => {
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => []);
    const app = buildApp(searchForNewAuthor, coverMapper);

    await request(app).get("/api/v1/author/lookup");

    expect(searchForNewAuthor).toHaveBeenCalledWith("");
  });

  it("forwards a thrown search error to the error pipeline", async () => {
    const coverMapper = makeCoverMapper();
    const searchForNewAuthor = vi.fn(async () => {
      throw new Error("provider down");
    });
    const app = buildApp(searchForNewAuthor, coverMapper);

    const res = await request(app).get("/api/v1/author/lookup").query({ term: "x" });

    expect(res.status).toBe(500);
  });
});
