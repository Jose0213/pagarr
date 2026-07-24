import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { updateLogFileController } from "../UpdateLogFileController.js";

describe("updateLogFileController", () => {
  it("GET /log/file/update lists only .txt files matching the filename pattern", async () => {
    const updateLogFolder = mkdtempSync(join(tmpdir(), "pagarr-update-logs-"));
    writeFileSync(join(updateLogFolder, "update.txt"), "update log\n");
    writeFileSync(join(updateLogFolder, "update.json"), "{}"); // excluded

    const router = updateLogFileController({
      getUpdateLogFolder: () => updateLogFolder,
      urlBase: "",
    });
    const app = express();
    app.use("/log/file/update", router);

    const res = await request(app).get("/log/file/update");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].filename).toBe("update.txt");
    expect(res.body[0].downloadUrl).toContain("/updatelogfile/");
  });

  it("GET /log/file/update returns an empty list when the update log folder doesn't exist", async () => {
    const router = updateLogFileController({
      getUpdateLogFolder: () => "/nonexistent/path/pagarr-test",
      urlBase: "",
    });
    const app = express();
    app.use("/log/file/update", router);

    const res = await request(app).get("/log/file/update");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET /log/file/update/:filename downloads a matching file", async () => {
    const updateLogFolder = mkdtempSync(join(tmpdir(), "pagarr-update-logs-2-"));
    writeFileSync(join(updateLogFolder, "update.txt"), "content\n");

    const router = updateLogFileController({
      getUpdateLogFolder: () => updateLogFolder,
      urlBase: "",
    });
    const app = express();
    app.use("/log/file/update", router);

    const res = await request(app).get("/log/file/update/update.txt");

    expect(res.status).toBe(200);
    expect(res.text).toBe("content\n");
  });
});
