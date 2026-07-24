import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../../../db/db-factory.js";
import { TagRepository } from "../../../../tags/tagRepository.js";
import { TagService } from "../../../../tags/tagService.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { tagDetailsController } from "../TagDetailsController.js";

function buildApp() {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  const tagRepository = new TagRepository(db);
  const tagService = new TagService(tagRepository, {
    authors: { allForTag: (tagId) => (tagId === 1 ? [{ id: 42 }] : []) },
  });

  const router = tagDetailsController({ tagService });

  const app = express();
  app.use(express.json());
  app.use("/tag/detail", router);
  app.use(readarrErrorPipeline());

  return { app, tagService };
}

describe("tagDetailsController", () => {
  it("GET /tag/detail returns details for every tag, including usage ids", async () => {
    const { app, tagService } = buildApp();
    tagService.add({ id: 0, label: "used" });

    const res = await request(app).get("/tag/detail");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ label: "used", authorIds: [42] });
  });

  it("GET /tag/detail/:id returns a single tag's details", async () => {
    const { app, tagService } = buildApp();
    const created = tagService.add({ id: 0, label: "solo" });

    const res = await request(app).get(`/tag/detail/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.label).toBe("solo");
    expect(res.body.rootFolderIds).toEqual(undefined); // no such field on the wire resource
  });

  it("does not mount create/update/delete (read-only controller)", async () => {
    const { app } = buildApp();

    const res = await request(app).post("/tag/detail").send({ id: 0, label: "x" });

    expect(res.status).toBe(404);
  });
});
