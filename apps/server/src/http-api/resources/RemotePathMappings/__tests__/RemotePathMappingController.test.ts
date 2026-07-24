import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../../db/db-factory.js";
import { RemotePathMappingRepository } from "../../../../download-tracking/remote-path-mappings/remotePathMappingRepository.js";
import { RemotePathMappingService } from "../../../../download-tracking/remote-path-mappings/remotePathMappingService.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { remotePathMappingController } from "../RemotePathMappingController.js";

/**
 * Tests for `remotePathMappingController()` -- exercises the plain
 * `restController()`-backed CRUD routes plus the controller-level
 * `SharedValidator` (Host/RemotePath NotEmpty, LocalPath chain).
 */

function buildApp() {
  const db: MainDatabase = createMainDatabase(":memory:");
  const repository = new RemotePathMappingRepository(db);
  const service = new RemotePathMappingService(repository);

  const router = remotePathMappingController({ service });

  const app = express();
  app.use(express.json());
  app.use("/remotepathmapping", router);
  app.use(readarrErrorPipeline());

  return { app, service };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    host: "sabnzbd",
    remotePath: "/downloads",
    localPath: "D:\\downloads",
    ...overrides,
  };
}

describe("remotePathMappingController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a mapping and returns 201 with normalized paths", async () => {
    const res = await request(ctx.app).post("/remotepathmapping").send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.host).toBe("sabnzbd");
    expect(res.body.remotePath).toBe("/downloads/");
    expect(res.body.localPath).toBe("D:\\downloads\\");
  });

  it("GET / lists mappings", async () => {
    await request(ctx.app).post("/remotepathmapping").send(validBody());
    await request(ctx.app)
      .post("/remotepathmapping")
      .send(validBody({ host: "other", remotePath: "/other" }));

    const res = await request(ctx.app).get("/remotepathmapping");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("GET /:id returns a single mapping", async () => {
    const created = await request(ctx.app).post("/remotepathmapping").send(validBody());

    const res = await request(ctx.app).get(`/remotepathmapping/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("PUT /:id updates a mapping and returns 202", async () => {
    const created = await request(ctx.app).post("/remotepathmapping").send(validBody());

    const res = await request(ctx.app)
      .put(`/remotepathmapping/${created.body.id}`)
      .send(validBody({ id: created.body.id, host: "renamed" }));

    expect(res.status).toBe(202);
    expect(res.body.host).toBe("renamed");
  });

  it("DELETE /:id removes a mapping", async () => {
    const created = await request(ctx.app).post("/remotepathmapping").send(validBody());

    const del = await request(ctx.app).delete(`/remotepathmapping/${created.body.id}`);
    expect(del.status).toBe(200);

    expect(ctx.service.all()).toHaveLength(0);
  });

  it("SharedValidator rejects an empty host", async () => {
    const res = await request(ctx.app)
      .post("/remotepathmapping")
      .send(validBody({ host: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "host" })])
    );
  });

  it("SharedValidator rejects an empty remote path", async () => {
    const res = await request(ctx.app)
      .post("/remotepathmapping")
      .send(validBody({ remotePath: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "remotePath" })])
    );
  });

  it("SharedValidator rejects an empty local path", async () => {
    const res = await request(ctx.app)
      .post("/remotepathmapping")
      .send(validBody({ localPath: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "localPath" })])
    );
  });

  it("SharedValidator rejects localPath == '/' (NotEqual('/'))", async () => {
    const res = await request(ctx.app)
      .post("/remotepathmapping")
      .send(validBody({ localPath: "/" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyName: "localPath",
          errorMessage: "Cannot be set to '/'",
        }),
      ])
    );
  });

  it("DELETE /:id rejects id <= 0", async () => {
    const res = await request(ctx.app).delete("/remotepathmapping/0");
    expect(res.status).toBe(400);
  });

  it("wires isMappedNetworkDrive/pathExists/isSystemFolder predicates into the LocalPath chain", async () => {
    const db: MainDatabase = createMainDatabase(":memory:");
    const repository = new RemotePathMappingRepository(db);
    const service = new RemotePathMappingService(repository);
    const router = remotePathMappingController({
      service,
      isSystemFolder: () => true,
    });
    const app = express();
    app.use(express.json());
    app.use("/remotepathmapping", router);
    app.use(readarrErrorPipeline());

    const res = await request(app).post("/remotepathmapping").send(validBody());

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "localPath" })])
    );
  });
});
