import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { metadataProviderConfigController } from "../MetadataProviderConfigResource.js";

function makeApp() {
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const configService = new ConfigService(repository);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/config/metadataprovider", metadataProviderConfigController(configService));
  app.use(readarrErrorPipeline());

  return { app, configService };
}

describe("metadataProviderConfigController", () => {
  it("GET / returns defaults", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/metadataprovider");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      writeAudioTags: "No",
      scrubAudioTags: false,
      writeBookTags: "NewFiles",
      updateCovers: true,
      embedMetadata: false,
    });
  });

  it("PUT persists new values", async () => {
    const { app, configService } = makeApp();

    const res = await request(app).put("/api/v1/config/metadataprovider/1").send({
      id: 1,
      writeAudioTags: "AllFiles",
      scrubAudioTags: true,
      writeBookTags: "Sync",
      updateCovers: false,
      embedMetadata: true,
    });

    expect(res.status).toBe(202);
    expect(configService.writeAudioTags).toBe("AllFiles");
    expect(configService.scrubAudioTags).toBe(true);
    expect(configService.embedMetadata).toBe(true);
  });
});
