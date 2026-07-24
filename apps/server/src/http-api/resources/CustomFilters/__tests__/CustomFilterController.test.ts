import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../../../db/db-factory.js";
import { CustomFilterRepository } from "../../../../custom-filters/customFilterRepository.js";
import { CustomFilterService } from "../../../../custom-filters/customFilterService.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { customFilterController } from "../CustomFilterController.js";

function buildApp() {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  const customFilterService = new CustomFilterService(new CustomFilterRepository(db));

  const router = customFilterController({ customFilterService });

  const app = express();
  app.use(express.json());
  app.use("/customfilter", router);
  app.use(readarrErrorPipeline());

  return { app, customFilterService };
}

describe("customFilterController", () => {
  it("POST /customfilter creates a filter and deserializes Filters JSON on the way out", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post("/customfilter")
      .send({
        id: 0,
        type: "authors",
        label: "Missing",
        filters: [{ key: "monitored", value: true }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      type: "authors",
      label: "Missing",
      filters: [{ key: "monitored", value: true }],
    });
  });

  it("GET /customfilter lists all filters", async () => {
    const { app, customFilterService } = buildApp();
    customFilterService.add({ id: 0, type: "authors", label: "A", filters: "[]" });
    customFilterService.add({ id: 0, type: "books", label: "B", filters: "[]" });

    const res = await request(app).get("/customfilter");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("GET /customfilter/:id returns a single filter", async () => {
    const { app, customFilterService } = buildApp();
    const created = customFilterService.add({
      id: 0,
      type: "authors",
      label: "Solo",
      filters: "[]",
    });

    const res = await request(app).get(`/customfilter/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Solo");
  });

  it("PUT /customfilter/:id updates a filter", async () => {
    const { app, customFilterService } = buildApp();
    const created = customFilterService.add({
      id: 0,
      type: "authors",
      label: "Old",
      filters: "[]",
    });

    const res = await request(app)
      .put(`/customfilter/${created.id}`)
      .send({ id: created.id, type: "authors", label: "New", filters: [] });

    expect(res.status).toBe(202);
    expect(customFilterService.get(created.id).label).toBe("New");
  });

  it("DELETE /customfilter/:id deletes a filter", async () => {
    const { app, customFilterService } = buildApp();
    const created = customFilterService.add({
      id: 0,
      type: "authors",
      label: "Gone",
      filters: "[]",
    });

    const res = await request(app).delete(`/customfilter/${created.id}`);

    expect(res.status).toBe(200);
    expect(() => customFilterService.get(created.id)).toThrow();
  });
});
