import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { ReleaseProfileService } from "../../../../profiles/releases/releaseProfileService.js";
import type { ReleaseProfileRepository } from "../../../../profiles/releases/releaseProfileRepository.js";
import {
  newReleaseProfile,
  type ReleaseProfile,
} from "../../../../profiles/releases/releaseProfile.js";
import {
  releaseProfileController,
  type IndexerExistenceCheck,
} from "../ReleaseProfileController.js";

function fakeRepository(seed: ReleaseProfile[] = []): ReleaseProfileRepository {
  const store = new Map<number, ReleaseProfile>(seed.map((d) => [d.id, d]));
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
    insert: (model: ReleaseProfile) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model: ReleaseProfile) => {
      store.set(model.id, model);
      return model;
    },
    delete: (id: number) => {
      store.delete(id);
    },
  };
}

function buildApp(
  service: ReleaseProfileService,
  indexerFactory: IndexerExistenceCheck = { exists: () => true }
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/releaseprofile",
    releaseProfileController({ releaseProfileService: service, indexerFactory })
  );
  app.use(readarrErrorPipeline());
  return app;
}

describe("releaseProfileController", () => {
  it("GET / returns all profiles", async () => {
    const service = new ReleaseProfileService(
      fakeRepository([newReleaseProfile({ id: 1, required: ["foo"] })])
    );
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/releaseprofile");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /:id returns a single profile", async () => {
    const service = new ReleaseProfileService(
      fakeRepository([newReleaseProfile({ id: 1, required: ["foo"] })])
    );
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/releaseprofile/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, required: ["foo"] });
  });

  describe("validation", () => {
    it("rejects a profile with both required and ignored empty", async () => {
      const service = new ReleaseProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/releaseprofile")
        .send({ ...newReleaseProfile({ required: [], ignored: [] }), tags: [] });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) =>
          f.errorMessage.includes("Must contain")
        )
      ).toBe(true);
    });

    it("accepts a profile with only required set", async () => {
      const service = new ReleaseProfileService(fakeRepository([]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/releaseprofile")
        .send({ ...newReleaseProfile({ required: ["foo"], ignored: [] }), tags: [] });

      expect(res.status).toBe(201);
    });

    it("rejects an enabled profile scoped to a non-existent indexer", async () => {
      const service = new ReleaseProfileService(fakeRepository([]));
      const app = buildApp(service, { exists: () => false });

      const res = await request(app)
        .post("/api/v1/releaseprofile")
        .send({
          ...newReleaseProfile({ enabled: true, indexerId: 42, required: ["foo"] }),
          tags: [],
        });

      expect(res.status).toBe(400);
      expect(
        (res.body as { propertyName: string }[]).some((f) => f.propertyName === "indexerId")
      ).toBe(true);
    });

    it("does not check indexer existence when disabled", async () => {
      const service = new ReleaseProfileService(fakeRepository([]));
      const app = buildApp(service, { exists: () => false });

      const res = await request(app)
        .post("/api/v1/releaseprofile")
        .send({
          ...newReleaseProfile({ enabled: false, indexerId: 42, required: ["foo"] }),
          tags: [],
        });

      expect(res.status).toBe(201);
    });

    it("does not check indexer existence when indexerId is 0 (all indexers)", async () => {
      const service = new ReleaseProfileService(fakeRepository([]));
      const app = buildApp(service, { exists: () => false });

      const res = await request(app)
        .post("/api/v1/releaseprofile")
        .send({
          ...newReleaseProfile({ enabled: true, indexerId: 0, required: ["foo"] }),
          tags: [],
        });

      expect(res.status).toBe(201);
    });
  });

  it("DELETE /:id deletes a profile", async () => {
    const service = new ReleaseProfileService(
      fakeRepository([newReleaseProfile({ id: 1, required: ["foo"] })])
    );
    const app = buildApp(service);

    const res = await request(app).delete("/api/v1/releaseprofile/1");

    expect(res.status).toBe(200);
  });
});
