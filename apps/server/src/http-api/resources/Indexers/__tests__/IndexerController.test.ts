import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { indexerController } from "../IndexerController.js";
import {
  buildIndexerFactory,
  fakeNewznabIndexer,
  inMemoryIndexerRepository,
  validIndexerBody,
} from "./testHelpers.js";
import { createIndexerDefinition } from "../../../../indexers/index.js";
import { createNewznabSettings } from "../../../../indexers/newznab/newznabSettings.js";

function buildApp() {
  const repository = inMemoryIndexerRepository();
  const indexer = fakeNewznabIndexer();
  const indexerFactory = buildIndexerFactory([indexer]);

  const implementationFactories = new Map([["newznab", () => fakeNewznabIndexer()]]);

  const router = indexerController({
    indexerFactory,
    indexerRepository: repository,
    implementationFactories,
  });

  const app = express();
  app.use(express.json());
  app.use("/indexer", router);
  app.use(readarrErrorPipeline());

  return { app, repository };
}

describe("indexerController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a definition and returns 201 with the Indexer-specific fields", async () => {
    const res = await request(ctx.app).post("/indexer").send(validIndexerBody());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Newznab");
    expect(res.body.enableRss).toBe(true);
    expect(res.body.enableAutomaticSearch).toBe(true);
    // Ported bug: EnableInteractiveSearch is never set by the real
    // IndexerResourceMapper.ToModel -- see IndexerResource.ts's doc comment.
    expect(res.body.enableInteractiveSearch).toBe(false);
    expect(res.body.priority).toBe(25);
    expect(res.body.supportsRss).toBe(true);
    expect(res.body.supportsSearch).toBe(true);
    expect(res.body.protocol).toBe(1);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "baseUrl", value: "https://example.com" }),
      ])
    );
  });

  it("SharedValidator rejects priority outside 1-50", async () => {
    const res = await request(ctx.app)
      .post("/indexer")
      .send(validIndexerBody({ priority: 0 }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "priority" })])
    );
  });

  it("SharedValidator rejects an empty name", async () => {
    const res = await request(ctx.app)
      .post("/indexer")
      .send(validIndexerBody({ name: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "name" })])
    );
  });

  it("PostValidator rejects a missing fields array", async () => {
    const body: Record<string, unknown> = validIndexerBody();
    delete body["fields"];

    const res = await request(ctx.app).post("/indexer").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "fields" })])
    );
  });

  it("GET / returns all definitions sorted by name, with Indexer fields intact", async () => {
    await request(ctx.app)
      .post("/indexer")
      .send(validIndexerBody({ name: "Zebra" }));
    await request(ctx.app)
      .post("/indexer")
      .send(validIndexerBody({ name: "Apple" }));

    const res = await request(ctx.app).get("/indexer");

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["Apple", "Zebra"]);
    expect(res.body[0].supportsRss).toBe(true);
  });

  it("GET /:id returns a single mapped resource with Indexer fields", async () => {
    const created = await request(ctx.app).post("/indexer").send(validIndexerBody());

    const res = await request(ctx.app).get(`/indexer/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.priority).toBe(25);
  });

  it("PUT /:id updates and returns 202 with updated Indexer fields", async () => {
    const created = await request(ctx.app).post("/indexer").send(validIndexerBody());

    const res = await request(ctx.app)
      .put(`/indexer/${created.body.id}`)
      .send(validIndexerBody({ id: created.body.id, name: "Renamed", priority: 40 }));

    expect(res.status).toBe(202);
    expect(res.body.name).toBe("Renamed");
    expect(res.body.priority).toBe(40);
  });

  it("PUT /bulk applies enableRss/priority across multiple indexers", async () => {
    const a = await request(ctx.app)
      .post("/indexer")
      .send(validIndexerBody({ name: "A", priority: 10 }));
    const b = await request(ctx.app)
      .post("/indexer")
      .send(validIndexerBody({ name: "B", priority: 20 }));

    const res = await request(ctx.app)
      .put("/indexer/bulk")
      .send({ ids: [a.body.id, b.body.id], priority: 33 });

    expect(res.status).toBe(202);
    const priorities = (res.body as { priority: number }[]).map((r) => r.priority);
    expect(priorities).toEqual([33, 33]);
  });

  it("DELETE /:id removes the definition (delegated to the base router)", async () => {
    const created = await request(ctx.app).post("/indexer").send(validIndexerBody());

    const del = await request(ctx.app).delete(`/indexer/${created.body.id}`);
    expect(del.status).toBe(200);
  });

  it("GET /schema returns default definitions with the Indexer-specific fields", async () => {
    const res = await request(ctx.app).get("/indexer/schema");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].implementation).toBe("Newznab");
    expect(res.body[0]).toHaveProperty("supportsRss");
    expect(res.body[0]).toHaveProperty("priority");
  });

  it("POST /action/:name passes through to the base router (delegated)", async () => {
    const res = await request(ctx.app).post("/indexer/action/dosomething").send(validIndexerBody());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("DownloadClientExistsCheck rejects a nonexistent download client id when injected", async () => {
    const repository = inMemoryIndexerRepository();
    const indexer = fakeNewznabIndexer();
    const indexerFactory = buildIndexerFactory([indexer]);
    const implementationFactories = new Map([["newznab", () => fakeNewznabIndexer()]]);

    const router = indexerController({
      indexerFactory,
      indexerRepository: repository,
      implementationFactories,
      downloadClientExists: { exists: () => false },
    });

    const app = express();
    app.use(express.json());
    app.use("/indexer", router);
    app.use(readarrErrorPipeline());

    const res = await request(app)
      .post("/indexer")
      .send(validIndexerBody({ downloadClientId: 5 }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "downloadClientId" })])
    );
  });

  it("resolves Torznab settings schema separately from Newznab (minimumSeeders field present)", async () => {
    const repository = inMemoryIndexerRepository();
    const torznabIndexer = fakeNewznabIndexer(
      { name: "Torznab" },
      createIndexerDefinition({
        implementation: "Torznab",
        configContract: "TorznabSettings",
        settings: createNewznabSettings(),
      })
    );
    const indexerFactory = buildIndexerFactory([torznabIndexer]);
    const implementationFactories = new Map([
      ["torznab", () => fakeNewznabIndexer({ name: "Torznab" })],
    ]);

    const router = indexerController({
      indexerFactory,
      indexerRepository: repository,
      implementationFactories,
    });
    const app = express();
    app.use(express.json());
    app.use("/indexer", router);
    app.use(readarrErrorPipeline());

    const res = await request(app)
      .post("/indexer")
      .send(
        validIndexerBody({
          implementation: "Torznab",
          configContract: "TorznabSettings",
          fields: [
            { name: "baseUrl", value: "https://example.com" },
            { name: "apiPath", value: "/api" },
            { name: "minimumSeeders", value: 5 },
          ],
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "minimumSeeders", value: 5 })])
    );
  });
});
