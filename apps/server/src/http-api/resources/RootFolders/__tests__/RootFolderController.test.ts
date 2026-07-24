import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../../../db/db-factory.js";
import { RootFolderRepository } from "../../../../root-folders/root-folder-repository.js";
import { RootFolderService } from "../../../../root-folders/root-folder-service.js";
import { DiskProvider } from "../../../../root-folders/disk-provider.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { rootFolderController } from "../RootFolderController.js";

function buildApp() {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  const rootFolderService = new RootFolderService(new RootFolderRepository(db), new DiskProvider());
  const eventAggregator = new EventAggregator();
  const httpServer = createServer();
  const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test-rootfolders");

  const router = rootFolderController({ rootFolderService, eventAggregator, signalRBroadcaster });

  const app = express();
  app.use(express.json());
  app.use("/rootfolder", router);
  app.use(readarrErrorPipeline());

  return { app, rootFolderService };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pagarr-rootfolder-"));
}

describe("rootFolderController", () => {
  it("POST /rootfolder creates a root folder for a real, writable directory", async () => {
    const { app } = buildApp();
    const path = tempDir();

    const res = await request(app).post("/rootfolder").send({
      id: 0,
      name: "Books",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: [],
      isCalibreLibrary: false,
      accessible: false,
      freeSpace: null,
      totalSpace: null,
    });

    expect(res.status).toBe(201);
    expect(res.body.path).toBe(path);
    expect(res.body.accessible).toBe(true);
  });

  it("POST /rootfolder rejects an empty name via sharedValidator", async () => {
    const { app } = buildApp();
    const path = tempDir();

    const res = await request(app).post("/rootfolder").send({
      id: 0,
      name: "",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: [],
      isCalibreLibrary: false,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([{ propertyName: "name", errorMessage: "'Name' must not be empty." }]);
  });

  it("GET /rootfolder returns all root folders with space stats", async () => {
    const { app, rootFolderService } = buildApp();
    const path = tempDir();
    await rootFolderService.add({
      id: 0,
      name: "Books",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: new Set(),
      isCalibreLibrary: false,
      calibreSettings: null,
      accessible: false,
      freeSpace: null,
      totalSpace: null,
    });

    const res = await request(app).get("/rootfolder");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accessible).toBe(true);
    expect(typeof res.body[0].freeSpace).toBe("number");
  });

  it("GET /rootfolder/:id returns a single root folder", async () => {
    const { app, rootFolderService } = buildApp();
    const path = tempDir();
    const created = await rootFolderService.add({
      id: 0,
      name: "Books",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: new Set(),
      isCalibreLibrary: false,
      calibreSettings: null,
      accessible: false,
      freeSpace: null,
      totalSpace: null,
    });

    const res = await request(app).get(`/rootfolder/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.path).toBe(path);
  });

  it("PUT /rootfolder/:id updates a root folder", async () => {
    const { app, rootFolderService } = buildApp();
    const path = tempDir();
    const created = await rootFolderService.add({
      id: 0,
      name: "Books",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: new Set(),
      isCalibreLibrary: false,
      calibreSettings: null,
      accessible: false,
      freeSpace: null,
      totalSpace: null,
    });

    const res = await request(app).put(`/rootfolder/${created.id}`).send({
      id: created.id,
      name: "Renamed",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: [],
      isCalibreLibrary: false,
    });

    expect(res.status).toBe(202);
    expect(res.body.name).toBe("Renamed");
  });

  it("DELETE /rootfolder/:id removes a root folder", async () => {
    const { app, rootFolderService } = buildApp();
    const path = tempDir();
    const created = await rootFolderService.add({
      id: 0,
      name: "Books",
      path,
      defaultMetadataProfileId: 1,
      defaultQualityProfileId: 1,
      defaultMonitorOption: 0,
      defaultNewItemMonitorOption: 0,
      defaultTags: new Set(),
      isCalibreLibrary: false,
      calibreSettings: null,
      accessible: false,
      freeSpace: null,
      totalSpace: null,
    });

    const res = await request(app).delete(`/rootfolder/${created.id}`);

    expect(res.status).toBe(200);
    expect(rootFolderService.all()).toHaveLength(0);
  });
});
