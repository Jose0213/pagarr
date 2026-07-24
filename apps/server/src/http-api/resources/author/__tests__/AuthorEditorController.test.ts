import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  AuthorStatusType,
  NewItemMonitorTypes,
  type Author,
  type AuthorService,
} from "../../../../books/index.js";
import type { IManageCommandQueue } from "../../../../messaging/commands/commandQueueManager.js";
import { ApplyTags } from "../../../rest/ApplyTags.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { authorEditorController } from "../AuthorEditorController.js";
import type { AuthorEditorResource } from "../AuthorEditorResource.js";

function makeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 10,
    cleanName: "stephenking",
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "/books/Stephen King",
    rootFolderPath: "/books",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [1],
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

function baseResource(overrides: Partial<AuthorEditorResource> = {}): AuthorEditorResource {
  return {
    authorIds: [1],
    applyTags: ApplyTags.Add,
    moveFiles: false,
    deleteFiles: false,
    ...overrides,
  };
}

function makeAuthorService(authors: Author[]): AuthorService {
  return {
    getAuthors: vi.fn((ids: number[]) => authors.filter((a) => ids.includes(a.id))),
    updateAuthors: vi.fn((list: Author[]) => list),
    deleteAuthor: vi.fn(),
  } as unknown as AuthorService;
}

function makeCommandQueueManager(): IManageCommandQueue {
  return {
    push: vi.fn(() => ({ id: 1 }) as never),
  } as unknown as IManageCommandQueue;
}

/** Typed accessor for the first call's first argument to `authorService.updateAuthors` -- avoids unsafe-any member access on a raw `vi.fn().mock.calls` read. */
function updateAuthorsArg(authorService: AuthorService, callIndex = 0): Author[] {
  const mockFn = authorService.updateAuthors as unknown as {
    mock: { calls: [Author[], boolean, unknown][] };
  };
  return mockFn.mock.calls[callIndex]![0];
}

function buildApp(authorService: AuthorService, commandQueueManager: IManageCommandQueue) {
  const router = authorEditorController({ authorService, commandQueueManager });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/author/editor", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("authorEditorController", () => {
  describe("PUT / (SaveAll)", () => {
    it("applies monitored/qualityProfileId/metadataProfileId when present", async () => {
      const author = makeAuthor();
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      const res = await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ monitored: false, qualityProfileId: 5, metadataProfileId: 6 }));

      expect(res.status).toBe(202);
      expect(authorService.updateAuthors).toHaveBeenCalled();
      const updated = updateAuthorsArg(authorService);
      expect(updated[0].monitored).toBe(false);
      expect(updated[0].qualityProfileId).toBe(5);
      expect(updated[0].metadataProfileId).toBe(6);
    });

    it("leaves fields untouched when not supplied (HasValue semantics)", async () => {
      const author = makeAuthor({ monitored: true, qualityProfileId: 1 });
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app).put("/api/v1/author/editor").send(baseResource());

      const updated = updateAuthorsArg(authorService);
      expect(updated[0].monitored).toBe(true);
      expect(updated[0].qualityProfileId).toBe(1);
    });

    it("applies tags with Add", async () => {
      const author = makeAuthor({ tags: [1] });
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ tags: [2, 3], applyTags: ApplyTags.Add }));

      const updated = updateAuthorsArg(authorService);
      expect(updated[0].tags.sort()).toEqual([1, 2, 3]);
    });

    it("applies tags with Remove", async () => {
      const author = makeAuthor({ tags: [1, 2, 3] });
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ tags: [2], applyTags: ApplyTags.Remove }));

      const updated = updateAuthorsArg(authorService);
      expect(updated[0].tags.sort()).toEqual([1, 3]);
    });

    it("applies tags with Replace", async () => {
      const author = makeAuthor({ tags: [1, 2, 3] });
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ tags: [9], applyTags: ApplyTags.Replace }));

      const updated = updateAuthorsArg(authorService);
      expect(updated[0].tags).toEqual([9]);
    });

    it("sets rootFolderPath and queues a BulkMoveAuthorCommand only when moveFiles=true", async () => {
      const author = makeAuthor();
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ rootFolderPath: "/new-root", moveFiles: true }));

      expect(commandQueueManager.push).toHaveBeenCalledTimes(1);
    });

    it("does NOT queue a move command when moveFiles=false, even with rootFolderPath set", async () => {
      const author = makeAuthor();
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ rootFolderPath: "/new-root", moveFiles: false }));

      expect(commandQueueManager.push).not.toHaveBeenCalled();
    });

    it("calls updateAuthors with useExistingRelativeFolder = !moveFiles", async () => {
      const author = makeAuthor();
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      await request(app)
        .put("/api/v1/author/editor")
        .send(baseResource({ moveFiles: true }));

      expect(authorService.updateAuthors).toHaveBeenCalledWith(
        expect.anything(),
        false,
        expect.anything()
      );
    });
  });

  describe("DELETE / (DeleteAuthor)", () => {
    it("deletes every author id with deleteFiles hardcoded to false", async () => {
      const author = makeAuthor();
      const authorService = makeAuthorService([author]);
      const commandQueueManager = makeCommandQueueManager();
      const app = buildApp(authorService, commandQueueManager);

      const res = await request(app)
        .delete("/api/v1/author/editor")
        .send(baseResource({ authorIds: [1, 2], deleteFiles: true }));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(authorService.deleteAuthor).toHaveBeenNthCalledWith(1, 1, false);
      expect(authorService.deleteAuthor).toHaveBeenNthCalledWith(2, 2, false);
    });
  });
});
