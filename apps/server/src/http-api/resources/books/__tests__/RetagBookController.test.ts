import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { retagBookController } from "../RetagBookController.js";
import type { RetagBookFilePreview } from "../../../../media-files-tags/retagBookFilePreview.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";

function buildPreview(overrides: Partial<RetagBookFilePreview> = {}): RetagBookFilePreview {
  return {
    authorId: 1,
    bookId: 10,
    trackNumbers: [],
    bookFileId: 100,
    path: "/path.mp3",
    changes: { title: ["old", "new"] },
    ...overrides,
  };
}

function buildApp(deps: Parameters<typeof retagBookController>[0]) {
  const app = express();
  app.use(express.json());
  app.use("/retag", retagBookController(deps));
  app.use(readarrErrorPipeline());
  return app;
}

describe("retagBookController", () => {
  it("GET /?bookId=X returns previews with changes, filtering out no-op previews", async () => {
    const getRetagPreviewsByBook = vi.fn(() => [buildPreview(), buildPreview({ changes: {} })]);
    const app = buildApp({
      metadataTagService: {
        getRetagPreviewsByBook,
        getRetagPreviewsByAuthor: vi.fn(),
      },
    });

    const res = await request(app).get("/retag").query("bookId=10");

    expect(res.status).toBe(200);
    expect(getRetagPreviewsByBook).toHaveBeenCalledWith(10);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].changes).toEqual([{ field: "title", oldValue: "old", newValue: "new" }]);
    expect(res.body[0].id).toBeUndefined();
  });

  it("GET /?authorId=X (no bookId) uses getRetagPreviewsByAuthor", async () => {
    const getRetagPreviewsByAuthor = vi.fn(() => [buildPreview()]);
    const app = buildApp({
      metadataTagService: {
        getRetagPreviewsByBook: vi.fn(),
        getRetagPreviewsByAuthor,
      },
    });

    const res = await request(app).get("/retag").query("authorId=1");

    expect(res.status).toBe(200);
    expect(getRetagPreviewsByAuthor).toHaveBeenCalledWith(1);
  });

  it("400s with BadRequestException when neither authorId nor bookId is given", async () => {
    const app = buildApp({
      metadataTagService: {
        getRetagPreviewsByBook: vi.fn(),
        getRetagPreviewsByAuthor: vi.fn(),
      },
    });

    const res = await request(app).get("/retag");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("One of authorId or bookId must be specified");
  });
});
