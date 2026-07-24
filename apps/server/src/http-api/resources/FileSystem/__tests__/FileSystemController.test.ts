import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { fileSystemController, type FileSystemControllerOptions } from "../FileSystemController.js";

function makeOptions(
  overrides: Partial<FileSystemControllerOptions> = {}
): FileSystemControllerOptions {
  return {
    diskProvider: { fileExists: vi.fn(() => false), folderExists: vi.fn(() => false) },
    diskScanService: { getBookFiles: vi.fn(() => []) },
    ...overrides,
  };
}

function buildApp(options: FileSystemControllerOptions) {
  const router = fileSystemController(options);
  const app = express();
  app.use("/filesystem", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("fileSystemController", () => {
  describe("GET /", () => {
    it("delegates to the lookup service and returns its result as JSON", async () => {
      const options = makeOptions({
        diskProvider: { fileExists: vi.fn(), folderExists: vi.fn(() => false) },
      });
      const app = buildApp(options);

      const res = await request(app).get("/filesystem?path=nonexistent");

      expect(res.status).toBe(200);
      // No separator, folder doesn't exist -> empty FileSystemResult.
      expect(res.body).toEqual({});
    });
  });

  describe("GET /type", () => {
    it("returns file when diskProvider.fileExists is true", async () => {
      const options = makeOptions({
        diskProvider: { fileExists: vi.fn(() => true), folderExists: vi.fn(() => false) },
      });
      const app = buildApp(options);

      const res = await request(app).get("/filesystem/type?path=%2Ffoo%2Fbar.txt");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ type: "file" });
    });

    it("returns folder (even if nonexistent) when diskProvider.fileExists is false", async () => {
      const options = makeOptions({
        diskProvider: { fileExists: vi.fn(() => false), folderExists: vi.fn(() => false) },
      });
      const app = buildApp(options);

      const res = await request(app).get("/filesystem/type?path=%2Ffoo%2Fbar");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ type: "folder" });
    });
  });

  describe("GET /mediafiles", () => {
    it("returns an empty array when the folder doesn't exist", async () => {
      const options = makeOptions({
        diskProvider: { fileExists: vi.fn(), folderExists: vi.fn(() => false) },
      });
      const app = buildApp(options);

      const res = await request(app).get("/filesystem/mediafiles?path=%2Fmissing");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("maps book files to {path, name} when the folder exists", async () => {
      const getBookFiles = vi.fn(() => [
        { fullName: "/music/a.mp3", name: "a.mp3", length: 1, lastWriteTimeUtc: "2024-01-01" },
      ]);
      const options = makeOptions({
        diskProvider: { fileExists: vi.fn(), folderExists: vi.fn(() => true) },
        diskScanService: { getBookFiles },
      });
      const app = buildApp(options);

      const res = await request(app).get("/filesystem/mediafiles?path=%2Fmusic");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ path: "/music/a.mp3", name: "a.mp3" }]);
      expect(getBookFiles).toHaveBeenCalledWith("/music");
    });
  });
});
