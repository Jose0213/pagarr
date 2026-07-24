import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { QualityProfileService } from "../../../../profiles/qualities/qualityProfileService.js";
import type { QualityProfileRepository } from "../../../../profiles/qualities/qualityProfileRepository.js";
import {
  newQualityProfile,
  type QualityProfile,
} from "../../../../profiles/qualities/qualityProfile.js";
import { newQualityItem } from "../../../../profiles/qualities/qualityProfileQualityItem.js";
import { Quality } from "../../../../qualities/quality.js";
import type { CustomFormat } from "../../../../profiles/customFormat.js";
import { qualityProfileController } from "../QualityProfileController.js";
import { qualityProfileSchemaController } from "../QualityProfileSchemaController.js";

function fakeRepository(seed: QualityProfile[] = []): QualityProfileRepository {
  const store = new Map<number, QualityProfile>(seed.map((d) => [d.id, d]));
  let nextId = seed.length + 1;

  return {
    all: () => [...store.values()],
    get: (id: number) => {
      const found = store.get(id);
      if (!found) {
        throw new Error(`not found: ${id}`);
      }
      return found;
    },
    exists: (id: number) => store.has(id),
    insert: (model: QualityProfile) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model: QualityProfile) => {
      store.set(model.id, model);
      return model;
    },
    delete: (id: number) => {
      store.delete(id);
    },
  };
}

/** Builds a minimally-valid QualityProfile covering ALL known qualities (satisfies AllQualitiesValidator), each as its own leaf item. */
function fullyCoveredProfile(overrides: Partial<QualityProfile> = {}): QualityProfile {
  const items = Quality.All.map((q) => newQualityItem({ quality: q, allowed: true }));
  return newQualityProfile({
    id: 1,
    name: "Test Profile",
    cutoff: Quality.MOBI.id,
    items,
    minFormatScore: 0,
    cutoffFormatScore: 0,
    formatItems: [],
    ...overrides,
  });
}

function buildApp(
  service: QualityProfileService,
  formatService = { all: (): CustomFormat[] => [] }
) {
  const app = express();
  app.use(express.json());
  // MOUNT ORDER: "/schema" must be registered before the base resource
  // router -- see MetadataProfileController.test.ts's buildApp for the same
  // note (applies identically to QualityProfileSchemaController.ts).
  app.use(
    "/api/v1/qualityprofile/schema",
    qualityProfileSchemaController({ qualityProfileService: service })
  );
  app.use(
    "/api/v1/qualityprofile",
    qualityProfileController({ qualityProfileService: service, formatService })
  );
  app.use(readarrErrorPipeline());
  return app;
}

describe("qualityProfileController", () => {
  it("GET / returns all profiles", async () => {
    const service = new QualityProfileService(fakeRepository([fullyCoveredProfile()]));
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/qualityprofile");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /:id returns a single profile", async () => {
    const service = new QualityProfileService(fakeRepository([fullyCoveredProfile()]));
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/qualityprofile/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: "Test Profile" });
  });

  describe("validation", () => {
    it("rejects an empty name", async () => {
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service);

      const profile = fullyCoveredProfile({ id: 0, name: "" });
      const res = await request(app).post("/api/v1/qualityprofile").send({
        id: 0,
        name: "",
        upgradeAllowed: profile.upgradeAllowed,
        cutoff: profile.cutoff,
        items: profile.items,
        minFormatScore: 0,
        cutoffFormatScore: 0,
        formatItems: [],
      });

      expect(res.status).toBe(400);
      expect((res.body as { propertyName: string }[]).some((f) => f.propertyName === "name")).toBe(
        true
      );
    });

    it("rejects a cutoff that doesn't match an allowed item", async () => {
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service);

      const items = Quality.All.map((q) =>
        newQualityItem({ quality: q, allowed: q.id !== Quality.MOBI.id })
      );

      const res = await request(app).post("/api/v1/qualityprofile").send({
        id: 0,
        name: "X",
        upgradeAllowed: false,
        cutoff: Quality.MOBI.id,
        items,
        minFormatScore: 0,
        cutoffFormatScore: 0,
        formatItems: [],
      });

      expect(res.status).toBe(400);
      expect(
        (res.body as { propertyName: string }[]).some((f) => f.propertyName === "cutoff")
      ).toBe(true);
    });

    it("rejects items missing an allowed quality", async () => {
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service);

      const items = Quality.All.map((q) => newQualityItem({ quality: q, allowed: false }));

      const res = await request(app).post("/api/v1/qualityprofile").send({
        id: 0,
        name: "X",
        upgradeAllowed: false,
        cutoff: Quality.Unknown.id,
        items,
        minFormatScore: 0,
        cutoffFormatScore: 0,
        formatItems: [],
      });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) =>
          f.errorMessage.includes("at least one allowed quality")
        )
      ).toBe(true);
    });

    it("rejects items missing coverage of all known qualities", async () => {
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service);

      // Omit one quality (EPUB) from the submitted items.
      const items = Quality.All.filter((q) => q.id !== Quality.EPUB.id).map((q) =>
        newQualityItem({ quality: q, allowed: true })
      );

      const res = await request(app).post("/api/v1/qualityprofile").send({
        id: 0,
        name: "X",
        upgradeAllowed: false,
        cutoff: Quality.Unknown.id,
        items,
        minFormatScore: 0,
        cutoffFormatScore: 0,
        formatItems: [],
      });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) =>
          f.errorMessage.includes("Must contain all qualities")
        )
      ).toBe(true);
    });

    it("rejects when a required CustomFormat is missing from formatItems", async () => {
      const cf: CustomFormat = { id: 5, name: "Format A" };
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service, { all: () => [cf] });

      const profile = fullyCoveredProfile({ formatItems: [] });

      const res = await request(app).post("/api/v1/qualityprofile").send({
        id: 0,
        name: profile.name,
        upgradeAllowed: profile.upgradeAllowed,
        cutoff: profile.cutoff,
        items: profile.items,
        minFormatScore: 0,
        cutoffFormatScore: 0,
        formatItems: [],
      });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) =>
          f.errorMessage.includes("All Custom Formats")
        )
      ).toBe(true);
    });

    it("accepts a fully valid profile and creates it (201)", async () => {
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service);

      const profile = fullyCoveredProfile({ id: 0, formatItems: [] });

      const res = await request(app).post("/api/v1/qualityprofile").send({
        id: 0,
        name: profile.name,
        upgradeAllowed: profile.upgradeAllowed,
        cutoff: profile.cutoff,
        items: profile.items,
        minFormatScore: 0,
        cutoffFormatScore: 0,
        formatItems: [],
      });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Test Profile");
    });
  });

  describe("DELETE /:id", () => {
    it("deletes an unused profile", async () => {
      const service = new QualityProfileService(fakeRepository([fullyCoveredProfile()]));
      const app = buildApp(service);

      const res = await request(app).delete("/api/v1/qualityprofile/1");

      expect(res.status).toBe(200);
    });
  });

  describe("GET /schema", () => {
    it("returns the default profile shape", async () => {
      const service = new QualityProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app).get("/api/v1/qualityprofile/schema");

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("");
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });
});
