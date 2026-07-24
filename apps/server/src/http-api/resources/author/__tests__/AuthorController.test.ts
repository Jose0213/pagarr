import { createServer } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthorAddedEvent,
  AuthorDeletedEvent,
  AuthorStatusType,
  NewItemMonitorTypes,
  type Author,
  type AuthorService,
  type BookService,
} from "../../../../books/index.js";
import type { AuthorStatisticsService } from "../../../../author-stats/index.js";
import { ModelNotFoundException } from "../../../../db/errors.js";
import { type IMapCoversToLocal } from "../../../../media-cover/index.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import type { IManageCommandQueue } from "../../../../messaging/commands/commandQueueManager.js";
import type { IRootFolderService } from "../../../../root-folders/root-folder-service.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { authorController, type IAddAuthorServiceLike } from "../AuthorController.js";
import { authorToResource } from "../AuthorResource.js";

/**
 * All fixture author paths use a Windows-rooted absolute path
 * (`isValidFolderPath` -- validation/paths/pathValidation.ts -- branches on
 * `process.platform`), so `process.platform` is stubbed to `"win32"` for
 * this file's tests (see `beforeEach` below) -- CI runs on Linux runners,
 * where these paths would otherwise fail SharedValidator/PutValidator's
 * real path-shape rule and every create/update route would 400. Matches
 * the established stubbing convention this repo already uses elsewhere
 * (e.g. `FileSystem/__tests__/FileSystemLookupService.test.ts`).
 */
const TEST_ROOT = "C:\\books";
const TEST_AUTHOR_PATH = "C:\\books\\Stephen King";

function makeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 10,
    cleanName: "stephenking",
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: TEST_AUTHOR_PATH,
    rootFolderPath: TEST_ROOT,
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    metadata: {
      id: 10,
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
      images: [],
      links: [],
      genres: [],
      ratings: { votes: 0, value: 0 },
    },
    ...overrides,
  };
}

function makeAuthorService(authors: Author[] = [makeAuthor()]): AuthorService {
  return {
    getAuthor: vi.fn((id: number) => {
      const author = authors.find((a) => a.id === id);
      if (!author) {
        // Mirrors AuthorRepository.get()'s real ModelNotFoundException throw.
        throw new ModelNotFoundException("Authors", id);
      }
      return author;
    }),
    getAllAuthors: vi.fn(() => authors),
    getAuthors: vi.fn((ids: number[]) => authors.filter((a) => ids.includes(a.id))),
    deleteAuthor: vi.fn(),
    updateAuthor: vi.fn((author: Author) => author),
    updateAuthors: vi.fn((list: Author[]) => list),
    allAuthorPaths: vi.fn(() => new Map(authors.map((a) => [a.id, a.path]))),
    findById: vi.fn(() => undefined),
    addAuthor: vi.fn((author: Author) => author),
    addAuthors: vi.fn((list: Author[]) => list),
    authorPathExists: vi.fn(() => false),
    findByName: vi.fn(() => undefined),
    findByNameInexact: vi.fn(() => undefined),
    getCandidates: vi.fn(() => []),
    getReportCandidates: vi.fn(() => []),
    getAllAuthorTags: vi.fn(() => new Map()),
    getAuthorByMetadataId: vi.fn(() => undefined),
    removeAddOptions: vi.fn(),
    allForTag: vi.fn(() => []),
  } as unknown as AuthorService;
}

function makeBookService(): BookService {
  return {
    getNextBooksByAuthorMetadataId: vi.fn(() => []),
    getLastBooksByAuthorMetadataId: vi.fn(() => []),
  } as unknown as BookService;
}

function makeAuthorStatisticsService(): AuthorStatisticsService {
  return {
    authorStatistics: vi.fn(() => []),
    authorStatisticsByAuthor: vi.fn(() => ({
      authorId: 0,
      bookFileCount: 0,
      bookCount: 0,
      availableBookCount: 0,
      totalBookCount: 0,
      sizeOnDisk: 0,
      bookStatistics: [],
    })),
  } as unknown as AuthorStatisticsService;
}

function makeCoverMapper(): IMapCoversToLocal {
  return {
    convertToLocalUrls: vi.fn(),
    getCoverPath: vi.fn(() => ""),
    ensureBookCovers: vi.fn(async () => {}),
  };
}

function makeCommandQueueManager(): IManageCommandQueue {
  return {
    push: vi.fn(() => ({ id: 1 })),
    pushMany: vi.fn(() => []),
    pushByName: vi.fn(() => ({}) as never),
    queue: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(() => undefined),
    getStarted: vi.fn(() => []),
    setMessage: vi.fn(),
    setResult: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    requeue: vi.fn(),
    cancel: vi.fn(),
    cleanCommands: vi.fn(),
  } as unknown as IManageCommandQueue;
}

function makeRootFolderService(): IRootFolderService {
  return {
    all: vi.fn(() => []),
    allWithSpaceStats: vi.fn(async () => []),
    add: vi.fn(async (rf) => rf),
    update: vi.fn(async (rf) => rf),
    remove: vi.fn(),
    get: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    allForTag: vi.fn(() => []),
    getBestRootFolder: vi.fn(() => undefined),
    getBestRootFolderPath: vi.fn((path: string) => path),
  };
}

function buildTestController(authors: Author[] = [makeAuthor()]) {
  const authorService = makeAuthorService(authors);
  const bookService = makeBookService();
  const authorStatisticsService = makeAuthorStatisticsService();
  const coverMapper = makeCoverMapper();
  const commandQueueManager = makeCommandQueueManager();
  const rootFolderService = makeRootFolderService();
  const eventAggregator = new EventAggregator();
  // Never listen()'d -- isConnected is naturally false, so every broadcast
  // path is a real no-op without needing an actual WebSocket server.
  const httpServer = createServer();
  const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test");

  const addAuthorService: IAddAuthorServiceLike = {
    addAuthor: vi.fn((author: Author) => {
      const created = { ...author, id: 99 };
      // authorService.getAuthor (above) reads live off this same `authors`
      // array, so pushing here is enough for a subsequent GET-by-id
      // (including the create route's own re-fetch) to find it.
      authors.push(created);
      return created;
    }),
  };

  const qualityProfileService = { exists: vi.fn(() => true) };
  const metadataProfileService = { exists: vi.fn(() => true) };

  const result = authorController({
    authorService,
    bookService,
    addAuthorService,
    authorStatisticsService,
    coverMapper,
    commandQueueManager,
    rootFolderService,
    eventAggregator,
    signalRBroadcaster,
    qualityProfileService,
    metadataProfileService,
  });

  return { ...result, authorService, coverMapper, commandQueueManager, signalRBroadcaster };
}

function buildApp(router: ReturnType<typeof authorController>["router"]) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/author", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("authorController", () => {
  let ctx: ReturnType<typeof buildTestController>;

  beforeEach(() => {
    // See this file's top-of-file comment: fixture paths are Windows-rooted.
    vi.stubGlobal("process", { ...process, platform: "win32" });
    ctx = buildTestController();
  });

  afterEach(() => {
    ctx.unsubscribe();
    ctx.signalRBroadcaster.close();
    vi.unstubAllGlobals();
  });

  describe("GET /", () => {
    it("returns every author mapped to a resource, covers/next-book/stats/root-folder linked", async () => {
      const app = buildApp(ctx.router);

      const res = await request(app).get("/api/v1/author");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].authorName).toBe("Stephen King");
      expect(ctx.coverMapper.convertToLocalUrls).toHaveBeenCalled();
    });
  });

  describe("GET /:id", () => {
    it("returns the author resource for an existing id", async () => {
      const app = buildApp(ctx.router);

      const res = await request(app).get("/api/v1/author/1");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.authorName).toBe("Stephen King");
    });

    it("404s for a missing id (ModelNotFoundException -> readarrErrorPipeline)", async () => {
      const app = buildApp(ctx.router);

      const res = await request(app).get("/api/v1/author/999");

      expect(res.status).toBe(404);
    });
  });

  describe("POST / (create)", () => {
    it("creates an author via addAuthorService and returns 201 with the fetched resource", async () => {
      const app = buildApp(ctx.router);
      const resource = authorToResource(makeAuthor({ id: 0 }))!;
      resource.foreignAuthorId = "fa-new";
      resource.authorName = "New Author";
      resource.path = "C:\\books\\New Author";

      const res = await request(app).post("/api/v1/author").send(resource);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(99);
    });

    it("400s when authorName is empty (PostValidator)", async () => {
      const app = buildApp(ctx.router);
      const resource = authorToResource(makeAuthor({ id: 0 }))!;
      resource.authorName = "";
      resource.foreignAuthorId = "fa-new";
      resource.path = "C:\\books\\New Author";

      const res = await request(app).post("/api/v1/author").send(resource);

      expect(res.status).toBe(400);
      const failures = res.body as Array<{ propertyName: string }>;
      expect(failures.some((f) => f.propertyName === "authorName")).toBe(true);
    });

    it("400s when foreignAuthorId is already used by an existing author (authorExistsValidator)", async () => {
      const authors = [makeAuthor({ id: 1 })];
      const authorService = makeAuthorService(authors);
      (authorService.findById as ReturnType<typeof vi.fn>).mockReturnValue(authors[0]);

      const eventAggregator = new EventAggregator();
      const httpServer = createServer();
      const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test-2");

      const { router } = authorController({
        authorService,
        bookService: makeBookService(),
        addAuthorService: { addAuthor: vi.fn((a: Author) => a) },
        authorStatisticsService: makeAuthorStatisticsService(),
        coverMapper: makeCoverMapper(),
        commandQueueManager: makeCommandQueueManager(),
        rootFolderService: makeRootFolderService(),
        eventAggregator,
        signalRBroadcaster,
        qualityProfileService: { exists: vi.fn(() => true) },
        metadataProfileService: { exists: vi.fn(() => true) },
      });

      const app = buildApp(router);
      const resource = authorToResource(makeAuthor({ id: 0 }))!;
      resource.foreignAuthorId = "fa-1";
      resource.path = "C:\\books\\Dupe";

      const res = await request(app).post("/api/v1/author").send(resource);

      expect(res.status).toBe(400);
      signalRBroadcaster.close();
    });
  });

  describe("PUT /:id (update)", () => {
    it("updates the author and returns 202 with the fetched resource", async () => {
      const app = buildApp(ctx.router);
      const resource = authorToResource(makeAuthor())!;
      resource.path = TEST_AUTHOR_PATH;
      resource.monitored = false;

      const res = await request(app).put("/api/v1/author/1").send(resource);

      expect(res.status).toBe(202);
      expect(ctx.authorService.updateAuthor).toHaveBeenCalled();
    });

    it("queues a MoveAuthorCommand when moveFiles=true", async () => {
      const app = buildApp(ctx.router);
      const resource = authorToResource(makeAuthor())!;
      resource.path = "C:\\books\\Stephen King Renamed";

      const res = await request(app).put("/api/v1/author/1?moveFiles=true").send(resource);

      expect(res.status).toBe(202);
      expect(ctx.commandQueueManager.push).toHaveBeenCalled();
    });

    it("400s on an invalid path (PutValidator, always runs)", async () => {
      const app = buildApp(ctx.router);
      const resource = authorToResource(makeAuthor())!;
      resource.path = "";

      const res = await request(app).put("/api/v1/author/1").send(resource);

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes the author and returns 200 with {}", async () => {
      const app = buildApp(ctx.router);

      const res = await request(app).delete("/api/v1/author/1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(ctx.authorService.deleteAuthor).toHaveBeenCalledWith(1, false, false);
    });

    it("passes deleteFiles/addImportListExclusion query flags through", async () => {
      const app = buildApp(ctx.router);

      await request(app).delete("/api/v1/author/1?deleteFiles=true&addImportListExclusion=true");

      expect(ctx.authorService.deleteAuthor).toHaveBeenCalledWith(1, true, true);
    });
  });
});

describe("authorController handlers (extra IHandle<T> subscriptions)", () => {
  it("handleAuthorAdded/handleAuthorDeleted don't throw when SignalR has no connections", () => {
    const ctx = buildTestController();

    expect(() => ctx.handlers.handleAuthorAdded(new AuthorAddedEvent(makeAuthor()))).not.toThrow();
    expect(() =>
      ctx.handlers.handleAuthorDeleted(new AuthorDeletedEvent(makeAuthor(), false, false))
    ).not.toThrow();

    ctx.unsubscribe();
    ctx.signalRBroadcaster.close();
  });

  it("handleBookFileDeleted no-ops on an Upgrade reason", () => {
    const ctx = buildTestController();
    const author = makeAuthor();

    expect(() =>
      ctx.handlers.handleBookFileDeleted({ reason: "Upgrade", bookFile: { author } })
    ).not.toThrow();

    ctx.unsubscribe();
    ctx.signalRBroadcaster.close();
  });
});
