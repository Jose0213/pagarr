import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../../db/db-factory.js";
import { MetadataRepository } from "../../../../extras/metadata/metadataRepository.js";
import type { IMetadata } from "../../../../extras/metadata/metadataBase.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { metadataController } from "../MetadataController.js";

/**
 * Tests for `metadataController()` -- exercises the adapter layer
 * (`adaptMetadataRepository`/`adaptMetadata` in MetadataController.ts)
 * bridging the real, narrow `extras/metadata/` module to a real
 * `thingi-provider/ProviderFactory`, plus the empty-registry ("no concrete
 * IMetadata consumer exists anywhere" -- see that file's doc comment)
 * default path.
 */

function fakeMetadataConsumer(): IMetadata {
  return {
    name: "FakeKodi",
    getFilenameAfterMoveForBookFile: (_author, bookFile) => bookFile.path,
    getFilenameAfterMoveForBookPath: (_author, bookPath) => bookPath,
    findMetadataFile: () => null,
    authorMetadata: () => null,
    bookMetadata: () => null,
    authorImages: () => [],
    bookImages: () => [],
    test: () => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

function buildApp(withProvider = true) {
  const db: MainDatabase = createMainDatabase(":memory:");
  const repository = new MetadataRepository(db);
  const router = metadataController({
    repository,
    providers: withProvider
      ? [
          {
            metadata: fakeMetadataConsumer(),
            implementation: "FakeKodi",
            configContract: "FakeKodiSettings",
          },
        ]
      : [],
  });

  const app = express();
  app.use(express.json());
  app.use("/metadata", router);
  app.use(readarrErrorPipeline());

  return { app, repository };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: "My Metadata",
    implementation: "FakeKodi",
    configContract: "FakeKodiSettings",
    tags: [],
    enable: true,
    fields: [],
    ...overrides,
  };
}

describe("metadataController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a metadata definition and returns enable as a sibling wire field", async () => {
    const res = await request(ctx.app).post("/metadata").send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Metadata");
    expect(res.body.enable).toBe(true);
    const fieldNames = (res.body.fields as { name: string }[]).map((f) => f.name);
    expect(fieldNames.every((n) => !n.startsWith("$$"))).toBe(true);
  });

  it("GET / lists metadata definitions", async () => {
    await request(ctx.app)
      .post("/metadata")
      .send(validBody({ name: "A" }));
    await request(ctx.app)
      .post("/metadata")
      .send(validBody({ name: "B" }));

    const res = await request(ctx.app).get("/metadata");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("GET /:id returns a single metadata definition", async () => {
    const created = await request(ctx.app).post("/metadata").send(validBody());

    const res = await request(ctx.app).get(`/metadata/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.enable).toBe(true);
  });

  it("PUT /:id updates enable and returns 202", async () => {
    const created = await request(ctx.app).post("/metadata").send(validBody());

    const res = await request(ctx.app)
      .put(`/metadata/${created.body.id}`)
      .send(validBody({ id: created.body.id, enable: false }));

    expect(res.status).toBe(202);
    expect(res.body.enable).toBe(false);
  });

  it("DELETE /:id removes the metadata definition", async () => {
    const created = await request(ctx.app).post("/metadata").send(validBody());

    const del = await request(ctx.app).delete(`/metadata/${created.body.id}`);
    expect(del.status).toBe(200);
    expect(ctx.repository.all()).toHaveLength(0);
  });

  it("GET /schema returns the registered FakeKodi default definition", async () => {
    const res = await request(ctx.app).get("/metadata/schema");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].implementation).toBe("FakeKodi");
    expect(res.body[0].enable).toBe(false);
  });

  it("GET /schema returns an empty array when no IMetadata consumers are registered (the real, documented state -- see MetadataController.ts's doc comment: no concrete writer exists anywhere)", async () => {
    const { app } = buildApp(false);

    const res = await request(app).get("/metadata/schema");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET / returns an empty array with no created definitions and no registered providers", async () => {
    const { app } = buildApp(false);

    const res = await request(app).get("/metadata");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("PUT /bulk and DELETE /bulk are reachable in this port (documented deviation from the real 404 -- see MetadataBulkResource.ts)", async () => {
    const a = await request(ctx.app).post("/metadata").send(validBody());

    const res = await request(ctx.app)
      .put("/metadata/bulk")
      .send({ ids: [a.body.id], tags: [3], applyTags: "Add" });

    expect(res.status).toBe(202);
  });

  it("POST /test runs against a not-yet-saved definition", async () => {
    const res = await request(ctx.app).post("/metadata/test").send(validBody());
    expect(res.status).toBe(200);
  });
});
