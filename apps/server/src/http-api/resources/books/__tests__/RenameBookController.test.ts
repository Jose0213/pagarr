import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { renameBookController } from "../RenameBookController.js";
import type { RenameBookFilePreview } from "../../../../media-files-organize/renameBookFilePreview.js";

function buildPreview(overrides: Partial<RenameBookFilePreview> = {}): RenameBookFilePreview {
  return {
    authorId: 1,
    bookId: 10,
    bookFileId: 100,
    existingPath: "/old/path.mp3",
    newPath: "/new/path.mp3",
    ...overrides,
  };
}

function buildApp(deps: Parameters<typeof renameBookController>[0]) {
  const app = express();
  app.use(express.json());
  app.use("/rename", renameBookController(deps));
  return app;
}

describe("renameBookController", () => {
  it("GET /?authorId=X&bookId=Y calls getRenamePreviewsForBook", async () => {
    const getRenamePreviewsForBook = vi.fn(() => [buildPreview()]);
    const getRenamePreviewsForAuthor = vi.fn(() => []);
    const app = buildApp({
      renameBookFileService: { getRenamePreviewsForBook, getRenamePreviewsForAuthor },
    });

    const res = await request(app).get("/rename").query("authorId=1&bookId=10");

    expect(res.status).toBe(200);
    expect(getRenamePreviewsForBook).toHaveBeenCalledWith(1, 10);
    expect(getRenamePreviewsForAuthor).not.toHaveBeenCalled();
    expect(res.body).toEqual([
      {
        authorId: 1,
        bookId: 10,
        bookFileId: 100,
        existingPath: "/old/path.mp3",
        newPath: "/new/path.mp3",
      },
    ]);
  });

  it("GET /?authorId=X (no bookId) calls getRenamePreviewsForAuthor", async () => {
    const getRenamePreviewsForAuthor = vi.fn(() => [buildPreview()]);
    const app = buildApp({
      renameBookFileService: {
        getRenamePreviewsForBook: vi.fn(),
        getRenamePreviewsForAuthor,
      },
    });

    const res = await request(app).get("/rename").query("authorId=1");

    expect(res.status).toBe(200);
    expect(getRenamePreviewsForAuthor).toHaveBeenCalledWith(1);
  });

  it("always strips id (the real C# mapper never assigns one)", async () => {
    const app = buildApp({
      renameBookFileService: {
        getRenamePreviewsForBook: vi.fn(),
        getRenamePreviewsForAuthor: () => [buildPreview()],
      },
    });

    const res = await request(app).get("/rename").query("authorId=1");

    expect(res.body[0].id).toBeUndefined();
  });
});
