import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newAuthor, newBook } from "../../../../books/models.js";
import type { AuthorService } from "../../../../books/authorService.js";
import type { BookService } from "../../../../books/bookService.js";
import type { ParsingService } from "../../../../parser/parsingService.js";
import { DownloadDecision } from "../../../../decision-engine/downloadDecision.js";
import type {
  AuthorWithQualityProfile,
  RemoteBook,
} from "../../../../decision-engine/remoteBook.js";
import { createReleaseInfo } from "../../../../indexers/releaseInfo.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { newQualityProfile } from "../../../../profiles/qualities/qualityProfile.js";
import { releaseController, type IDownloadServiceLike } from "../ReleaseController.js";

function makeAuthorWithProfile(
  overrides: Partial<AuthorWithQualityProfile> = {}
): AuthorWithQualityProfile {
  return {
    ...newAuthor(),
    id: 1,
    authorMetadataId: 5,
    qualityProfile: newQualityProfile({ id: 1, items: [] }),
    ...overrides,
  };
}

function makeRemoteBook(overrides: Partial<RemoteBook> = {}): RemoteBook {
  return {
    release: createReleaseInfo({ guid: "guid-1", indexerId: 1, title: "Author - Book" }),
    parsedBookInfo: {
      bookTitle: "Book",
      authorName: "Author",
      quality: newQualityModel(Quality.MOBI),
      discography: false,
      discographyStart: 0,
      discographyEnd: 0,
      releaseGroup: null,
      releaseHash: null,
      releaseVersion: null,
      releaseTitle: null,
    },
    author: makeAuthorWithProfile(),
    books: [{ ...newBook(), id: 9, title: "Book" }],
    downloadAllowed: true,
    customFormats: [],
    customFormatScore: 0,
    releaseSource: 0,
    ...overrides,
  };
}

function buildApp(
  overrides: {
    authorService?: Partial<AuthorService>;
    bookService?: Partial<BookService>;
    parsingService?: Partial<ParsingService>;
    downloadService?: Partial<IDownloadServiceLike>;
  } = {}
) {
  const authorService = {
    getAuthor: vi.fn(() => makeAuthorWithProfile()),
    getAuthorByMetadataId: vi.fn(() => makeAuthorWithProfile()),
    ...overrides.authorService,
  } as unknown as AuthorService;

  const bookService = {
    getBook: vi.fn(() => ({ ...newBook(), id: 9, title: "Book" })),
    ...overrides.bookService,
  } as unknown as BookService;

  const parsingService = {
    getBooks: vi.fn(() => [{ ...newBook(), id: 9, title: "Book" }]),
    ...overrides.parsingService,
  } as unknown as ParsingService;

  const downloadService: IDownloadServiceLike = {
    downloadReport: vi.fn(async () => {}),
    ...overrides.downloadService,
  };

  const rssFetcherAndParser = { fetch: vi.fn(async () => []) };
  const releaseSearchService = {
    bookSearch: vi.fn(async () => []),
    authorSearch: vi.fn(async () => []),
  };
  const downloadDecisionMaker = { getRssDecision: vi.fn(() => []) };
  const prioritizeDownloadDecision = { prioritizeDecisions: vi.fn((d: unknown[]) => d) };

  const router = releaseController({
    rssFetcherAndParser,
    releaseSearchService,
    downloadDecisionMaker,
    prioritizeDownloadDecision: prioritizeDownloadDecision as never,
    downloadService,
    authorService,
    bookService,
    parsingService,
  });

  const app = express();
  app.use(express.json());
  app.use("/release", router);
  app.use(readarrErrorPipeline());

  return {
    app,
    router,
    releaseSearchService,
    rssFetcherAndParser,
    downloadDecisionMaker,
    downloadService,
  };
}

async function seedCache(ctx: ReturnType<typeof buildApp>) {
  // Populate the controller's internal remoteBookCache by running a search
  // that produces a decision, mirroring the real flow: GET a release list
  // first (which caches each release under `${indexerId}_${guid}`), then
  // POST / to grab it.
  const decision = new DownloadDecision(makeRemoteBook());
  ctx.releaseSearchService.bookSearch.mockResolvedValueOnce([decision] as never);

  const listRes = await request(ctx.app).get("/release?bookId=9");
  return listRes.body[0];
}

describe("releaseController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("GET /?bookId=X delegates to releaseSearchService.bookSearch and maps decisions", async () => {
    const decision = new DownloadDecision(makeRemoteBook());
    ctx.releaseSearchService.bookSearch.mockResolvedValueOnce([decision] as never);

    const res = await request(ctx.app).get("/release?bookId=9");

    expect(res.status).toBe(200);
    expect(ctx.releaseSearchService.bookSearch).toHaveBeenCalledWith(9, true, true, true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].guid).toBe("guid-1");
    expect(res.body[0].releaseWeight).toBe(0);
  });

  it("GET /?authorId=X delegates to releaseSearchService.authorSearch", async () => {
    const decision = new DownloadDecision(makeRemoteBook());
    ctx.releaseSearchService.authorSearch.mockResolvedValueOnce([decision] as never);

    const res = await request(ctx.app).get("/release?authorId=1");

    expect(res.status).toBe(200);
    expect(ctx.releaseSearchService.authorSearch).toHaveBeenCalledWith(1, false, true, true);
    expect(res.body).toHaveLength(1);
  });

  it("GET / (no query params) falls back to RSS fetch + getRssDecision", async () => {
    const decision = new DownloadDecision(makeRemoteBook());
    ctx.rssFetcherAndParser.fetch.mockResolvedValueOnce([]);
    ctx.downloadDecisionMaker.getRssDecision.mockReturnValueOnce([decision]);

    const res = await request(ctx.app).get("/release");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("PostValidator rejects a missing/zero indexerId", async () => {
    const res = await request(ctx.app)
      .post("/release")
      .send({ id: 0, guid: "some-guid", indexerId: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "indexerId" })])
    );
  });

  it("PostValidator rejects an empty guid", async () => {
    const res = await request(ctx.app).post("/release").send({ id: 0, guid: "", indexerId: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "guid" })])
    );
  });

  it("POST / 404s when the release isn't in cache", async () => {
    const res = await request(ctx.app)
      .post("/release")
      .send({ id: 0, guid: "not-cached", indexerId: 1 });

    expect(res.status).toBe(404);
  });

  it("POST / downloads a cached release and echoes it back", async () => {
    const cached = await seedCache(ctx);

    const res = await request(ctx.app)
      .post("/release")
      .send({ ...cached, id: 0 });

    expect(res.status).toBe(200);
    expect(ctx.downloadService.downloadReport).toHaveBeenCalled();
    expect(res.body.guid).toBe(cached.guid);
  });

  it("POST / translates a ReleaseDownloadException into a 409", async () => {
    const { ReleaseDownloadException } = await import("../ReleaseController.js");
    const failingDownload: IDownloadServiceLike = {
      downloadReport: vi.fn(async () => {
        throw new ReleaseDownloadException("boom");
      }),
    };
    const failCtx = buildApp({ downloadService: failingDownload });
    const cached = await seedCache(failCtx);

    const res = await request(failCtx.app)
      .post("/release")
      .send({ ...cached, id: 0 });

    expect(res.status).toBe(409);
  });
});
