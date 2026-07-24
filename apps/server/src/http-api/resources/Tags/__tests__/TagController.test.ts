import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../../../db/db-factory.js";
import { TagRepository } from "../../../../tags/tagRepository.js";
import { TagService } from "../../../../tags/tagService.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { tagController } from "../TagController.js";
import { createServer } from "node:http";

function buildTestDb() {
  return createDatabase("Test", { path: ":memory:", migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR });
}

function buildApp() {
  const db = buildTestDb();
  const tagRepository = new TagRepository(db);
  const tagService = new TagService(tagRepository);
  const eventAggregator = new EventAggregator();
  const httpServer = createServer();
  const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test-tags");

  const router = tagController({ tagService, eventAggregator, signalRBroadcaster });

  const app = express();
  app.use(express.json());
  app.use("/tag", router);
  app.use(readarrErrorPipeline());

  return { app, tagService };
}

describe("tagController", () => {
  it("GET /tag returns all tags sorted by label", async () => {
    const { app, tagService } = buildApp();
    tagService.add({ id: 0, label: "zeta" });
    tagService.add({ id: 0, label: "alpha" });

    const res = await request(app).get("/tag");

    expect(res.status).toBe(200);
    expect((res.body as { label: string }[]).map((t) => t.label)).toEqual(["alpha", "zeta"]);
  });

  it("GET /tag/:id returns a single tag", async () => {
    const { app, tagService } = buildApp();
    const created = tagService.add({ id: 0, label: "mytag" });

    const res = await request(app).get(`/tag/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: created.id, label: "mytag" });
  });

  it("POST /tag creates a tag, lower-casing the label", async () => {
    const { app } = buildApp();

    const res = await request(app).post("/tag").send({ id: 0, label: "MixedCase" });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe("mixedcase");
  });

  it("POST /tag rejects an empty label via sharedValidator", async () => {
    const { app } = buildApp();

    const res = await request(app).post("/tag").send({ id: 0, label: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([
      { propertyName: "label", errorMessage: "'Label' must not be empty." },
    ]);
  });

  it("PUT /tag/:id updates a tag", async () => {
    const { app, tagService } = buildApp();
    const created = tagService.add({ id: 0, label: "original" });

    const res = await request(app)
      .put(`/tag/${created.id}`)
      .send({ id: created.id, label: "updated" });

    expect(res.status).toBe(202);
    expect(tagService.getTag(created.id).label).toBe("updated");
  });

  it("DELETE /tag/:id deletes an unused tag", async () => {
    const { app, tagService } = buildApp();
    const created = tagService.add({ id: 0, label: "deleteme" });

    const res = await request(app).delete(`/tag/${created.id}`);

    expect(res.status).toBe(200);
    expect(() => tagService.getTag(created.id)).toThrow();
  });

  it("DELETE /tag/:id refuses to delete a tag still in use (ModelConflictException -> 409)", async () => {
    // Built with a usage provider reporting the tag is referenced, rather
    // than reusing buildApp()'s always-empty providers.
    const db = buildTestDb();
    const tagRepository = new TagRepository(db);
    const inUseService = new TagService(tagRepository, {
      authors: { allForTag: () => [{ id: 1 }] },
    });
    const inUseTag = inUseService.add({ id: 0, label: "inuse" });

    const eventAggregator = new EventAggregator();
    const httpServer = createServer();
    const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test-tags-2");
    const router = tagController({
      tagService: inUseService,
      eventAggregator,
      signalRBroadcaster,
    });
    const inUseApp = express();
    inUseApp.use(express.json());
    inUseApp.use("/tag", router);
    inUseApp.use(readarrErrorPipeline());

    const res = await request(inUseApp).delete(`/tag/${inUseTag.id}`);

    expect(res.status).toBe(409);
  });
});
