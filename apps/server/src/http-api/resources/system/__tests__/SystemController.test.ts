import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigFileProvider } from "../../../../config/configFileProvider.js";
import { MainDatabase } from "../../../../db/db-factory.js";
import { Database, DatabaseType } from "../../../../db/database.js";
import type { ILifecycleService } from "../../../../lifecycle/lifecycleService.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { systemController, type SystemControllerDeps } from "../SystemController.js";
import type {
  AppFolderInfoLike,
  BuildInfoLike,
  DeploymentInfoProviderLike,
  OsInfoLike,
  PlatformInfoLike,
  RuntimeInfoLike,
} from "../SystemResource.js";

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-system-test-"));
  configPath = join(tempDir, "config.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<SystemControllerDeps> = {}): SystemControllerDeps {
  const configFileProvider = new ConfigFileProvider(configPath);

  const buildInfo: BuildInfoLike = {
    appName: "Pagarr",
    version: "1.0.0.0",
    buildTime: new Date(0).toISOString(),
    isDebug: false,
  };
  const runtimeInfo: RuntimeInfoLike = {
    isAdmin: false,
    isUserInteractive: true,
    isProduction: false,
    startTime: new Date(0).toISOString(),
    mode: "Console",
  };
  const platformInfo: PlatformInfoLike = { version: "22.14.0" };
  const osInfo: OsInfoLike = { name: "Windows", version: "10", isDocker: false };
  const deploymentInfoProvider: DeploymentInfoProviderLike = {
    packageVersion: null,
    packageAuthor: null,
    packageUpdateMechanism: "BuiltIn",
    packageUpdateMechanismMessage: null,
  };
  const appFolderInfo: AppFolderInfoLike = {
    startUpFolder: "/app",
    getAppDataPath: () => "/app/data",
  };

  const lifecycleService: ILifecycleService = {
    shutdown: vi.fn(),
    restart: vi.fn(),
  };

  return {
    configFileProvider,
    buildInfo,
    runtimeInfo,
    platformInfo,
    osInfo,
    deploymentInfoProvider,
    appFolderInfo,
    database: new MainDatabase(new Database("test", makeInMemorySqlite())),
    lifecycleService,
    ...overrides,
  };
}

function makeInMemorySqlite() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    'CREATE TABLE "VersionInfo" ("Version" INTEGER NOT NULL, "AppliedOn" TEXT, "Description" TEXT)'
  );
  db.exec('INSERT INTO "VersionInfo" ("Version") VALUES (7)');
  return db;
}

function makeApp(deps: SystemControllerDeps) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/system", systemController(deps));
  app.use(readarrErrorPipeline());
  return app;
}

describe("systemController", () => {
  it("GET /status returns the full system snapshot", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).get("/api/v1/system/status");

    expect(res.status).toBe(200);
    expect(res.body.appName).toBe("Pagarr");
    expect(res.body.instanceName).toBe("Pagarr");
    expect(res.body.isNetCore).toBe(true);
    expect(res.body.runtimeName).toBe("netcore");
    expect(res.body.databaseType).toBe(DatabaseType.SQLite);
    expect(res.body.migrationVersion).toBe(7);
    expect(res.body.authentication).toBe("None");
  });

  it("GET /routes returns 501 (ASP.NET routing introspection not applicable)", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).get("/api/v1/system/routes");

    expect(res.status).toBe(501);
  });

  it("GET /routes/duplicate returns 501", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).get("/api/v1/system/routes/duplicate");

    expect(res.status).toBe(501);
  });

  it("POST /shutdown returns shuttingDown:true and fires lifecycleService.shutdown()", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).post("/api/v1/system/shutdown");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ shuttingDown: true });
    // Fire-and-forget -- give the microtask queue a tick.
    await new Promise((resolve) => setImmediate(resolve));
    expect(deps.lifecycleService.shutdown).toHaveBeenCalledOnce();
  });

  it("POST /restart returns restarting:true and fires lifecycleService.restart()", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).post("/api/v1/system/restart");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ restarting: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(deps.lifecycleService.restart).toHaveBeenCalledOnce();
  });
});
