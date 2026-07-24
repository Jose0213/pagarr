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
import { uiConfigController, uiConfigSharedValidator } from "../UiConfigResource.js";

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-ui-config-test-"));
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
  app.use("/api/v1/config/ui", uiConfigController(configFileProvider, configService));
  app.use(readarrErrorPipeline());

  return { app, configFileProvider, configService };
}

describe("uiConfigController", () => {
  it("GET / returns defaults, theme sourced from ConfigFileProvider", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/ui");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.theme).toBe("auto");
    expect(res.body.uiLanguage).toBe(1);
  });

  it("PUT persists to BOTH ConfigFileProvider (theme) and ConfigService (everything else)", async () => {
    const { app, configFileProvider, configService } = makeApp();

    const res = await request(app).put("/api/v1/config/ui/1").send({
      id: 1,
      firstDayOfWeek: 1,
      calendarWeekColumnHeader: "ddd M/D",
      shortDateFormat: "MMM D YYYY",
      longDateFormat: "dddd, MMMM D YYYY",
      timeFormat: "h(:mm)a",
      showRelativeDates: true,
      enableColorImpairedMode: false,
      uiLanguage: 1,
      theme: "dark",
    });

    expect(res.status).toBe(202);
    expect(res.body.theme).toBe("dark");
    expect(configFileProvider.theme).toBe("dark");
    expect(configService.firstDayOfWeek).toBe(1);
  });

  it("PUT rejects an invalid uiLanguage id", async () => {
    const { app } = makeApp();

    const res = await request(app).put("/api/v1/config/ui/1").send({
      id: 1,
      firstDayOfWeek: 0,
      calendarWeekColumnHeader: "",
      shortDateFormat: "",
      longDateFormat: "",
      timeFormat: "",
      showRelativeDates: true,
      enableColorImpairedMode: false,
      uiLanguage: 9999,
      theme: "auto",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([
      { propertyName: "uiLanguage", errorMessage: "Invalid UI Language value" },
    ]);
  });
});

describe("uiConfigSharedValidator", () => {
  it("accumulates BOTH failures when uiLanguage is < 1 and not a known id", () => {
    const failures = uiConfigSharedValidator({
      id: 1,
      firstDayOfWeek: 0,
      calendarWeekColumnHeader: "",
      shortDateFormat: "",
      longDateFormat: "",
      timeFormat: "",
      showRelativeDates: true,
      enableColorImpairedMode: false,
      uiLanguage: -5,
      theme: "auto",
    });

    expect(failures).toEqual([
      { propertyName: "uiLanguage", errorMessage: "Invalid UI Language value" },
      { propertyName: "uiLanguage", errorMessage: "The UI Language value cannot be less than 1" },
    ]);
  });
});
