import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { logFileController } from "../LogFileController.js";

function buildApp() {
  const logFolder = mkdtempSync(join(tmpdir(), "pagarr-logs-"));
  writeFileSync(join(logFolder, "readarr.txt"), "log line one\n");
  writeFileSync(join(logFolder, "readarr.1.txt"), "log line two\n");
  writeFileSync(join(logFolder, "not-a-log.json"), "{}");

  const router = logFileController({
    getLogFolder: () => logFolder,
    urlBase: "",
  });
  const app = express();
  app.use("/log/file", router);

  return { app, logFolder };
}

describe("logFileController", () => {
  it("GET /log/file lists every file in the log folder as a LogFileResource", async () => {
    const { app } = buildApp();

    const res = await request(app).get("/log/file");

    expect(res.status).toBe(200);
    // getFiles lists everything non-recursively (unlike update, which filters) --
    // includes the .json file too.
    expect(res.body).toHaveLength(3);
    const files = res.body as { filename: string; contentsUrl: string; downloadUrl: string }[];
    const filenames = files.map((f) => f.filename).sort();
    expect(filenames).toEqual(["not-a-log.json", "readarr.1.txt", "readarr.txt"]);
    expect(files[0]!.contentsUrl).toContain("/api/v1//"); // resource="" -- literal double slash, see doc comment
    expect(files[0]!.downloadUrl).toContain("/logfile/");
  });

  it("GET /log/file/:filename downloads a matching .txt file", async () => {
    const { app } = buildApp();

    const res = await request(app).get("/log/file/readarr.txt");

    expect(res.status).toBe(200);
    expect(res.text).toBe("log line one\n");
  });

  it("GET /log/file/:filename 404s for a filename that doesn't match the .txt route pattern", async () => {
    const { app } = buildApp();

    const res = await request(app).get("/log/file/not-a-log.json");

    expect(res.status).toBe(404);
  });

  it("GET /log/file/:filename 404s for a matching-pattern filename that doesn't exist", async () => {
    const { app } = buildApp();

    const res = await request(app).get("/log/file/missing.txt");

    expect(res.status).toBe(404);
  });
});
