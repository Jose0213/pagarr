import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { indexerConfigController, indexerConfigSharedValidator } from "../IndexerConfigResource.js";

function makeApp() {
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const configService = new ConfigService(repository);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/config/indexer", indexerConfigController(configService));
  app.use(readarrErrorPipeline());

  return { app, configService };
}

describe("indexerConfigController", () => {
  it("GET / returns defaults", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/indexer");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      minimumAge: 0,
      maximumSize: 0,
      retention: 0,
      rssSyncInterval: 15,
    });
  });

  it("PUT persists valid values", async () => {
    const { app, configService } = makeApp();

    const res = await request(app).put("/api/v1/config/indexer/1").send({
      id: 1,
      minimumAge: 5,
      maximumSize: 100,
      retention: 30,
      rssSyncInterval: 20,
    });

    expect(res.status).toBe(202);
    expect(configService.minimumAge).toBe(5);
    expect(configService.rssSyncInterval).toBe(20);
  });

  it("PUT rejects negative minimumAge/maximumSize/retention", async () => {
    const { app } = makeApp();

    const res = await request(app).put("/api/v1/config/indexer/1").send({
      id: 1,
      minimumAge: -1,
      maximumSize: -1,
      retention: -1,
      rssSyncInterval: 15,
    });

    expect(res.status).toBe(400);
    const failures = res.body as { propertyName: string }[];
    const propertyNames = failures.map((f) => f.propertyName);
    expect(propertyNames).toEqual(
      expect.arrayContaining(["minimumAge", "maximumSize", "retention"])
    );
  });
});

describe("indexerConfigSharedValidator", () => {
  it("rejects rssSyncInterval outside 0 or 10-120", () => {
    const base = { id: 1, minimumAge: 0, maximumSize: 0, retention: 0, rssSyncInterval: 5 };

    expect(indexerConfigSharedValidator(base)).toEqual([
      {
        propertyName: "rssSyncInterval",
        errorMessage: "Must be between 10 and 120 or 0 to disable",
      },
    ]);
  });

  it("accepts 0 (disabled) and values in 10-120", () => {
    const zero = { id: 1, minimumAge: 0, maximumSize: 0, retention: 0, rssSyncInterval: 0 };
    const mid = { id: 1, minimumAge: 0, maximumSize: 0, retention: 0, rssSyncInterval: 60 };

    expect(indexerConfigSharedValidator(zero)).toEqual([]);
    expect(indexerConfigSharedValidator(mid)).toEqual([]);
  });
});
