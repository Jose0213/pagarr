import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileProvider } from "../../../../config/configFileProvider.js";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import {
  developmentConfigController,
  developmentConfigSharedValidator,
} from "../DevelopmentConfigResource.js";

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-dev-config-test-"));
  configPath = join(tempDir, "config.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeApp() {
  const configFileProvider = new ConfigFileProvider(configPath);
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const configService = new ConfigService(repository);

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/config/development",
    developmentConfigController(configFileProvider, configService)
  );
  app.use(readarrErrorPipeline());

  return { app, configFileProvider, configService };
}

describe("developmentConfigController", () => {
  it("GET / returns defaults", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/development");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      metadataSource: "",
      consoleLogLevel: "",
      logSql: false,
      logRotate: 50,
      filterSentryEvents: true,
    });
  });

  it("PUT persists to both stores", async () => {
    const { app, configFileProvider, configService } = makeApp();

    const res = await request(app).put("/api/v1/config/development/1").send({
      id: 1,
      metadataSource: "",
      consoleLogLevel: "Info",
      logSql: true,
      logRotate: 10,
      filterSentryEvents: false,
    });

    expect(res.status).toBe(202);
    expect(configFileProvider.consoleLogLevel).toBe("Info");
    expect(configFileProvider.logSql).toBe(true);
    expect(configFileProvider.logRotate).toBe(10);
    expect(configFileProvider.filterSentryEvents).toBe(false);
    void configService;
  });

  it("PUT rejects an invalid metadataSource URL", async () => {
    const { app } = makeApp();

    const res = await request(app).put("/api/v1/config/development/1").send({
      id: 1,
      metadataSource: "not a url",
      consoleLogLevel: "",
      logSql: false,
      logRotate: 50,
      filterSentryEvents: true,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([{ propertyName: "metadataSource", errorMessage: "Invalid Format" }]);
  });

  it("PUT allows a blank metadataSource", async () => {
    const { app } = makeApp();

    const res = await request(app).put("/api/v1/config/development/1").send({
      id: 1,
      metadataSource: "",
      consoleLogLevel: "",
      logSql: false,
      logRotate: 50,
      filterSentryEvents: true,
    });

    expect(res.status).toBe(202);
  });
});

describe("developmentConfigSharedValidator", () => {
  it("accepts a valid absolute URL", () => {
    const failures = developmentConfigSharedValidator({
      id: 1,
      metadataSource: "https://example.com",
      consoleLogLevel: "",
      logSql: false,
      logRotate: 50,
      filterSentryEvents: true,
    });

    expect(failures).toEqual([]);
  });
});
