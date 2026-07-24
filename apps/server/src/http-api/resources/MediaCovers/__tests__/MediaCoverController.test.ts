import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import {
  mediaCoverController,
  type MediaCoverControllerDiskProviderLike,
} from "../MediaCoverController.js";

const COVER_ROOT = join("C:", "pagarr-test-covers");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDiskProvider(
  overrides: Partial<MediaCoverControllerDiskProviderLike> = {}
): MediaCoverControllerDiskProviderLike {
  return {
    fileExists: vi.fn(() => false),
    getFileSize: vi.fn(() => 0),
    ...overrides,
  };
}

function buildApp(diskProvider: MediaCoverControllerDiskProviderLike) {
  const router = mediaCoverController({ coverRootFolder: COVER_ROOT, diskProvider });
  const app = express();
  app.use("/mediacover", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("mediaCoverController", () => {
  describe("GET /author/:authorId/:filename", () => {
    it("404s when the file doesn't exist and there's no base image to fall back to", async () => {
      const diskProvider = makeDiskProvider({ fileExists: vi.fn(() => false) });
      const app = buildApp(diskProvider);

      const res = await request(app).get("/mediacover/author/5/poster-500.jpg");

      expect(res.status).toBe(404);
    });

    it("404s for a filename that doesn't match the jpg|png|gif route constraint", async () => {
      const diskProvider = makeDiskProvider();
      const app = buildApp(diskProvider);

      const res = await request(app).get("/mediacover/author/5/poster.txt");

      expect(res.status).toBe(404);
    });

    it("serves the file with the correct content-type when it exists with nonzero size", async () => {
      // res.sendFile() needs a real file on disk to stream (it's backed by
      // the `send` package, not just an fs.existsSync check) -- write one to
      // a real temp dir laid out the same way coverRootFolder/{authorId}/
      // {filename} is, and point the diskProvider stub's fileExists/
      // getFileSize at that same real path so the "already exists, don't
      // fall back to the base image" branch is what actually gets exercised.
      const root = mkdtempSync(join(tmpdir(), "pagarr-covers-"));
      tempDirs.push(root);
      const authorDir = join(root, "5");
      mkdirSync(authorDir, { recursive: true });
      const filePath = join(authorDir, "poster.jpg");
      writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const diskProvider = makeDiskProvider({
        fileExists: vi.fn((p: string) => p === filePath),
        getFileSize: vi.fn((p: string) => (p === filePath ? 4 : 0)),
      });
      const router = mediaCoverController({ coverRootFolder: root, diskProvider });
      const app = express();
      app.use("/mediacover", router);
      app.use(readarrErrorPipeline());

      const res = await request(app).get("/mediacover/author/5/poster.jpg");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("image/jpeg");
      expect(diskProvider.fileExists).toHaveBeenCalledWith(filePath);
    });

    it("falls back to the base (non-resized) image when a resized variant is missing", async () => {
      const resizedPath = join(COVER_ROOT, "5", "poster-500.jpg");
      const basePath = join(COVER_ROOT, "5", "poster.jpg");
      const diskProvider = makeDiskProvider({
        fileExists: vi.fn((p: string) => p === basePath),
        getFileSize: vi.fn(() => 0),
      });
      const app = buildApp(diskProvider);

      await request(app).get("/mediacover/author/5/poster-500.jpg");

      expect(diskProvider.fileExists).toHaveBeenCalledWith(resizedPath);
      expect(diskProvider.fileExists).toHaveBeenCalledWith(basePath);
    });
  });

  describe("GET /book/:bookId/:filename", () => {
    it("builds the Books-nested path", async () => {
      const diskProvider = makeDiskProvider({ fileExists: vi.fn(() => false) });
      const app = buildApp(diskProvider);

      await request(app).get("/mediacover/book/9/cover.png");

      expect(diskProvider.fileExists).toHaveBeenCalledWith(
        join(COVER_ROOT, "Books", "9", "cover.png")
      );
    });

    it("404s for a non-integer bookId", async () => {
      const diskProvider = makeDiskProvider();
      const app = buildApp(diskProvider);

      const res = await request(app).get("/mediacover/book/notanumber/cover.png");

      expect(res.status).toBe(404);
    });
  });
});
