import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { downloadClientConfigController } from "../DownloadClientConfigResource.js";

function makeApp() {
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const configService = new ConfigService(repository);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/config/downloadclient", downloadClientConfigController(configService));
  app.use(readarrErrorPipeline());

  return { app, configService };
}

describe("downloadClientConfigController", () => {
  it("GET / returns defaults matching ConfigService", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/downloadclient");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      downloadClientWorkingFolders: "_UNPACK_|_FAILED_",
      enableCompletedDownloadHandling: true,
      autoRedownloadFailed: true,
      autoRedownloadFailedFromInteractiveSearch: true,
    });
  });

  it("PUT persists to ConfigService and re-fetches", async () => {
    const { app, configService } = makeApp();

    const res = await request(app).put("/api/v1/config/downloadclient/1").send({
      id: 1,
      downloadClientWorkingFolders: "_UNPACK_",
      enableCompletedDownloadHandling: false,
      autoRedownloadFailed: false,
      autoRedownloadFailedFromInteractiveSearch: false,
    });

    expect(res.status).toBe(202);
    expect(res.body.downloadClientWorkingFolders).toBe("_UNPACK_");
    expect(configService.enableCompletedDownloadHandling).toBe(false);
    expect(configService.autoRedownloadFailed).toBe(false);
  });

  it("has no create/delete routes", async () => {
    const { app } = makeApp();

    const postRes = await request(app).post("/api/v1/config/downloadclient").send({});
    const deleteRes = await request(app).delete("/api/v1/config/downloadclient/1");

    expect(postRes.status).toBe(404);
    expect(deleteRes.status).toBe(404);
  });
});
