import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { MetadataProfileService } from "../../../../profiles/metadata/metadataProfileService.js";
import type { MetadataProfileRepository } from "../../../../profiles/metadata/metadataProfileRepository.js";
import {
  newMetadataProfile,
  type MetadataProfile,
} from "../../../../profiles/metadata/metadataProfile.js";
import { metadataProfileController } from "../MetadataProfileController.js";
import { metadataProfileSchemaController } from "../MetadataProfileSchemaController.js";

function fakeRepository(seed: MetadataProfile[] = []): MetadataProfileRepository {
  const store = new Map<number, MetadataProfile>(seed.map((d) => [d.id, d]));
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
    insert: (model: MetadataProfile) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model: MetadataProfile) => {
      store.set(model.id, model);
      return model;
    },
    delete: (id: number) => {
      store.delete(id);
    },
  };
}

function buildApp(service: MetadataProfileService) {
  const app = express();
  app.use(express.json());
  // MOUNT ORDER: "/schema" must be registered before the base resource
  // router, or "GET /api/v1/metadataprofile/schema" would match the base
  // router's "GET /:id" first (id="schema") and 500 -- see
  // MetadataProfileSchemaController.ts's doc comment; this mirrors the real
  // C# routing where "metadataprofile/schema" and "metadataprofile" are two
  // separate, independently-routed controllers, not one nested under the
  // other.
  app.use("/api/v1/metadataprofile/schema", metadataProfileSchemaController());
  app.use("/api/v1/metadataprofile", metadataProfileController({ profileService: service }));
  app.use(readarrErrorPipeline());
  return app;
}

describe("metadataProfileController", () => {
  it("GET / returns all profiles", async () => {
    const service = new MetadataProfileService(
      fakeRepository([newMetadataProfile({ id: 1, name: "Standard" })])
    );
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/metadataprofile");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /:id returns a single profile", async () => {
    const service = new MetadataProfileService(
      fakeRepository([newMetadataProfile({ id: 1, name: "Standard" })])
    );
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/metadataprofile/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: "Standard" });
  });

  describe("validation", () => {
    it("rejects 'None' as a reserved name", async () => {
      const service = new MetadataProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/metadataprofile")
        .send({ ...newMetadataProfile({ name: "None" }) });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) =>
          f.errorMessage.includes("reserved profile name")
        )
      ).toBe(true);
    });

    it("rejects an empty name", async () => {
      const service = new MetadataProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/metadataprofile")
        .send({ ...newMetadataProfile({ name: "" }) });

      expect(res.status).toBe(400);
      expect((res.body as { propertyName: string }[]).some((f) => f.propertyName === "name")).toBe(
        true
      );
    });

    it("rejects negative minPopularity/minPages", async () => {
      const service = new MetadataProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/metadataprofile")
        .send({ ...newMetadataProfile({ name: "X", minPopularity: -1, minPages: -1 }) });

      expect(res.status).toBe(400);
      const propertyNames = (res.body as { propertyName: string }[]).map((f) => f.propertyName);
      expect(propertyNames).toContain("minPopularity");
      expect(propertyNames).toContain("minPages");
    });

    it("accepts 'null' as a literal allowedLanguages entry without a known-language check", async () => {
      const service = new MetadataProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/metadataprofile")
        .send({ ...newMetadataProfile({ name: "X", allowedLanguages: "null" }) });

      expect(res.status).toBe(201);
    });

    it("rejects unknown languages when isKnownLanguage is supplied and returns false", async () => {
      const service = new MetadataProfileService(fakeRepository([]));
      const app = express();
      app.use(express.json());
      app.use(
        "/api/v1/metadataprofile",
        metadataProfileController({ profileService: service, isKnownLanguage: () => false })
      );
      app.use(readarrErrorPipeline());

      const res = await request(app)
        .post("/api/v1/metadataprofile")
        .send({ ...newMetadataProfile({ name: "X", allowedLanguages: "eng" }) });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) => f.errorMessage === "Unknown languages")
      ).toBe(true);
    });
  });

  describe("DELETE /:id", () => {
    it("refuses to delete the None profile", async () => {
      const service = new MetadataProfileService(
        fakeRepository([newMetadataProfile({ id: 1, name: "None", minPopularity: 1e10 })])
      );
      const app = buildApp(service);

      const res = await request(app).delete("/api/v1/metadataprofile/1");

      expect(res.status).toBe(400);
    });

    it("deletes an unused, non-None profile", async () => {
      const service = new MetadataProfileService(
        fakeRepository([newMetadataProfile({ id: 2, name: "Standard" })])
      );
      const app = buildApp(service);

      const res = await request(app).delete("/api/v1/metadataprofile/2");

      expect(res.status).toBe(200);
    });
  });

  describe("GET /schema", () => {
    it("returns a template profile with AllowedLanguages defaulted to 'eng'", async () => {
      const service = new MetadataProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app).get("/api/v1/metadataprofile/schema");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ allowedLanguages: "eng" });
      // Ported: base RestResource.Id is [JsonIgnore(WhenWritingDefault)] --
      // a fresh template profile's id is 0, so "id" should be OMITTED here
      // (unlike LanguageResource, MetadataProfileResource does NOT override
      // this behavior).
      expect(res.body.id).toBeUndefined();
    });
  });
});
