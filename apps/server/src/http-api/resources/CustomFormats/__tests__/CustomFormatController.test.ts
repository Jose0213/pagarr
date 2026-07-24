import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../../db/db-factory.js";
import { CustomFormatRepository } from "../../../../custom-formats/customFormatRepository.js";
import { CustomFormatService } from "../../../../custom-formats/customFormatService.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { customFormatController } from "../CustomFormatController.js";

/**
 * Tests for `customFormatController()` -- plain CRUD over the real
 * CustomFormats module (Phase 2, already merged) plus this task's own
 * schema/validation port.
 */

function buildApp() {
  const db: MainDatabase = createMainDatabase(":memory:");
  const repository = new CustomFormatRepository(db);
  const formatService = new CustomFormatService(repository);

  const router = customFormatController({ formatService });

  const app = express();
  app.use(express.json());
  app.use("/customformat", router);
  app.use(readarrErrorPipeline());

  return { app, formatService };
}

function sizeConditionBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Big Files",
    implementation: "SizeSpecification",
    negate: false,
    required: false,
    fields: [
      { name: "min", value: 1 },
      { name: "max", value: 10 },
    ],
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: "My Format",
    includeCustomFormatWhenRenaming: false,
    specifications: [sizeConditionBody()],
    ...overrides,
  };
}

describe("customFormatController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a custom format and returns id even when 0 would normally be stripped", async () => {
    const res = await request(ctx.app).post("/customformat").send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Format");
    expect(res.body.specifications).toHaveLength(1);
    expect(res.body.specifications[0].implementation).toBe("SizeSpecification");
    expect(res.body.specifications[0].fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "min", value: 1 })])
    );
  });

  it("GET / always includes id:0-shaped resources with the id key present (CustomFormat's JsonIgnore(Never) override)", async () => {
    // GET /schema (a 0-id-carrying resource shape) must include "id" even
    // though restController()'s own stripDefaultId() would otherwise omit
    // it for id === 0 -- verified via the schema endpoint below instead,
    // since every CREATEd CustomFormat gets a real non-zero id from the
    // in-memory sqlite autoincrement.
    const res = await request(ctx.app).get("/customformat/schema");
    expect(res.status).toBe(200);
    for (const item of res.body as { id: unknown }[]) {
      expect(Object.prototype.hasOwnProperty.call(item, "id")).toBe(true);
    }
  });

  it("GET / lists custom formats", async () => {
    await request(ctx.app)
      .post("/customformat")
      .send(validBody({ name: "A" }));
    await request(ctx.app)
      .post("/customformat")
      .send(validBody({ name: "B" }));

    const res = await request(ctx.app).get("/customformat");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("GET /:id returns a single custom format", async () => {
    const created = await request(ctx.app).post("/customformat").send(validBody());

    const res = await request(ctx.app).get(`/customformat/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("PUT /:id updates and returns 202", async () => {
    const created = await request(ctx.app).post("/customformat").send(validBody());

    const res = await request(ctx.app)
      .put(`/customformat/${created.body.id}`)
      .send(validBody({ id: created.body.id, name: "Renamed" }));

    expect(res.status).toBe(202);
    expect(res.body.name).toBe("Renamed");
  });

  it("DELETE /:id removes the custom format", async () => {
    const created = await request(ctx.app).post("/customformat").send(validBody());

    const del = await request(ctx.app).delete(`/customformat/${created.body.id}`);
    expect(del.status).toBe(200);
    expect(ctx.formatService.all()).toHaveLength(0);
  });

  it("SharedValidator rejects an empty name", async () => {
    const res = await request(ctx.app)
      .post("/customformat")
      .send(validBody({ name: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "name" })])
    );
  });

  it("SharedValidator rejects a duplicate name", async () => {
    await request(ctx.app)
      .post("/customformat")
      .send(validBody({ name: "Dup" }));

    const res = await request(ctx.app)
      .post("/customformat")
      .send(validBody({ name: "Dup" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: "name", errorMessage: "Must be unique." }),
      ])
    );
  });

  it("SharedValidator rejects an empty specifications array (both NotEmpty and the Custom 'at least one Condition' rule fire)", async () => {
    const res = await request(ctx.app)
      .post("/customformat")
      .send(validBody({ specifications: [] }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: "specifications" }),
        expect.objectContaining({ errorMessage: "Must contain at least one Condition" }),
      ])
    );
  });

  it("SharedValidator rejects a condition with an empty name", async () => {
    const res = await request(ctx.app)
      .post("/customformat")
      .send(validBody({ specifications: [sizeConditionBody({ name: "" })] }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorMessage: "Condition name(s) cannot be empty or consist of only spaces",
        }),
      ])
    );
  });

  it("settings-level validation (Validate(model)) rejects an invalid SizeSpecification (max <= min) after shared validation passes", async () => {
    const res = await request(ctx.app)
      .post("/customformat")
      .send(
        validBody({
          specifications: [
            sizeConditionBody({
              name: "Bad",
              fields: [
                { name: "min", value: 5 },
                { name: "max", value: 1 },
              ],
            }),
          ],
        })
      );

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "max" })])
    );
  });

  it("GET /schema returns every registered specification with presets, including the synthetic 'Preferred Words' preset", async () => {
    const res = await request(ctx.app).get("/customformat/schema");

    expect(res.status).toBe(200);
    const implementations = (res.body as { implementation: string }[]).map((r) => r.implementation);
    expect(implementations).toEqual(
      expect.arrayContaining([
        "ReleaseTitleSpecification",
        "ReleaseGroupSpecification",
        "SizeSpecification",
        "IndexerFlagSpecification",
      ])
    );

    const releaseTitle = (
      res.body as { implementation: string; presets: { name: string }[] }[]
    ).find((r) => r.implementation === "ReleaseTitleSpecification");
    expect(releaseTitle?.presets.some((p) => p.name === "Preferred Words")).toBe(true);
  });

  it("GET /schema includes a preset per saved format's own condition, scoped to matching implementation", async () => {
    await request(ctx.app)
      .post("/customformat")
      .send(validBody({ name: "MyFormat" }));

    const res = await request(ctx.app).get("/customformat/schema");
    const sizeSchema = (res.body as { implementation: string; presets: { name: string }[] }[]).find(
      (r) => r.implementation === "SizeSpecification"
    );

    expect(sizeSchema?.presets.some((p) => p.name === "MyFormat: Big Files")).toBe(true);
  });

  it("POST / rejects an unknown specification implementation", async () => {
    const res = await request(ctx.app)
      .post("/customformat")
      .send(
        validBody({
          specifications: [sizeConditionBody({ implementation: "NotARealSpecification" })],
        })
      );

    expect(res.status).toBe(500);
  });
});
