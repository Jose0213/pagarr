import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { bookshelfController } from "../BookshelfController.js";
import type { Author } from "../../../../books/models.js";
import { MonitorTypes, NewItemMonitorTypes } from "../../../../books/models.js";

function buildAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 10,
    cleanName: "author",
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "/books/author",
    rootFolderPath: "/books",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    ...overrides,
  };
}

function buildApp(deps: Parameters<typeof bookshelfController>[0]) {
  const app = express();
  app.use(express.json());
  app.use("/bookshelf", bookshelfController(deps));
  return app;
}

describe("bookshelfController", () => {
  it("POST / applies per-author monitored flag and calls setBookMonitoredStatus for each author", async () => {
    const author1 = buildAuthor({ id: 1, monitored: false });
    const author2 = buildAuthor({ id: 2, monitored: false });
    const getAuthors = vi.fn(() => [author1, author2]);
    const setBookMonitoredStatus = vi.fn();

    const app = buildApp({
      authorService: { getAuthors },
      bookMonitoredService: { setBookMonitoredStatus },
    });

    const res = await request(app)
      .post("/bookshelf")
      .send({
        authors: [
          { id: 1, monitored: true },
          { id: 2, monitored: false },
        ],
      });

    expect(res.status).toBe(202);
    expect(getAuthors).toHaveBeenCalledWith([1, 2]);
    expect(author1.monitored).toBe(true);
    expect(author2.monitored).toBe(false);
    expect(setBookMonitoredStatus).toHaveBeenCalledTimes(2);
  });

  it("forces monitored=false when MonitoringOptions.monitor is None, overriding the per-author flag", async () => {
    const author1 = buildAuthor({ id: 1, monitored: false });
    const app = buildApp({
      authorService: { getAuthors: () => [author1] },
      bookMonitoredService: { setBookMonitoredStatus: vi.fn() },
    });

    await request(app)
      .post("/bookshelf")
      .send({
        authors: [{ id: 1, monitored: true }],
        monitoringOptions: { monitor: MonitorTypes.None, booksToMonitor: [], monitored: false },
      });

    expect(author1.monitored).toBe(false);
  });

  it("applies monitorNewItems when provided", async () => {
    const author1 = buildAuthor({ id: 1, monitorNewItems: NewItemMonitorTypes.All });
    const app = buildApp({
      authorService: { getAuthors: () => [author1] },
      bookMonitoredService: { setBookMonitoredStatus: vi.fn() },
    });

    await request(app)
      .post("/bookshelf")
      .send({
        authors: [{ id: 1 }],
        monitorNewItems: NewItemMonitorTypes.None,
      });

    expect(author1.monitorNewItems).toBe(NewItemMonitorTypes.None);
  });

  it("returns 202 with the original request body (Accepted(request))", async () => {
    const app = buildApp({
      authorService: { getAuthors: () => [buildAuthor({ id: 1 })] },
      bookMonitoredService: { setBookMonitoredStatus: vi.fn() },
    });

    const body = { authors: [{ id: 1, monitored: true }] };
    const res = await request(app).post("/bookshelf").send(body);

    expect(res.status).toBe(202);
    expect(res.body).toEqual(body);
  });

  it("throws when an author id in the request isn't found in the fetched set", async () => {
    const app = buildApp({
      authorService: { getAuthors: () => [] },
      bookMonitoredService: { setBookMonitoredStatus: vi.fn() },
    });

    const res = await request(app)
      .post("/bookshelf")
      .send({ authors: [{ id: 999, monitored: true }] });

    expect(res.status).toBe(500);
  });
});
