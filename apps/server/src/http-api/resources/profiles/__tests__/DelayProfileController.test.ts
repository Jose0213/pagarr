import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { DelayProfileService } from "../../../../profiles/delay/delayProfileService.js";
import type { DelayProfileRepository } from "../../../../profiles/delay/delayProfileRepository.js";
import {
  DownloadProtocol,
  newDelayProfile,
  type DelayProfile,
} from "../../../../profiles/delay/delayProfile.js";
import { delayProfileController } from "../DelayProfileController.js";

function fakeRepository(seed: DelayProfile[] = []): DelayProfileRepository {
  const store = new Map<number, DelayProfile>(seed.map((d) => [d.id, d]));
  let nextId = seed.length + 1;

  return {
    all: vi.fn(() => [...store.values()]),
    get: vi.fn((id: number) => {
      const found = store.get(id);
      if (!found) {
        throw new Error(`not found: ${id}`);
      }
      return found;
    }),
    find: vi.fn(),
    insert: vi.fn((model: DelayProfile) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    }),
    update: vi.fn((model: DelayProfile) => {
      store.set(model.id, model);
      return model;
    }),
    updateMany: vi.fn((models: DelayProfile[]) => {
      for (const m of models) {
        store.set(m.id, m);
      }
    }),
    delete: vi.fn((id: number) => {
      store.delete(id);
    }),
    count: vi.fn(() => store.size),
  };
}

function globalProfile(overrides: Partial<DelayProfile> = {}): DelayProfile {
  return newDelayProfile({
    id: 1,
    enableUsenet: true,
    enableTorrent: true,
    preferredProtocol: DownloadProtocol.Usenet,
    order: 0,
    tags: new Set<number>(),
    ...overrides,
  });
}

function buildApp(service: DelayProfileService) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/delayprofile", delayProfileController({ delayProfileService: service }));
  app.use(readarrErrorPipeline());
  return app;
}

describe("delayProfileController", () => {
  it("GET / returns all profiles", async () => {
    const service = new DelayProfileService(fakeRepository([globalProfile()]));
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/delayprofile");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 1, enableUsenet: true });
  });

  it("GET /:id returns a single profile", async () => {
    const service = new DelayProfileService(fakeRepository([globalProfile()]));
    const app = buildApp(service);

    const res = await request(app).get("/api/v1/delayprofile/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1 });
  });

  describe("POST / (create)", () => {
    it("creates a profile with at least one tag and rejects an empty one", async () => {
      const service = new DelayProfileService(fakeRepository([globalProfile()]));
      const app = buildApp(service);

      const badRes = await request(app).post("/api/v1/delayprofile").send({
        id: 0,
        enableUsenet: true,
        enableTorrent: false,
        preferredProtocol: DownloadProtocol.Usenet,
        usenetDelay: 0,
        torrentDelay: 0,
        bypassIfHighestQuality: false,
        bypassIfAboveCustomFormatScore: false,
        minimumCustomFormatScore: 0,
        order: 0,
        tags: [],
      });

      expect(badRes.status).toBe(400);
      expect(
        (badRes.body as { propertyName: string }[]).some((f) => f.propertyName === "tags")
      ).toBe(true);

      const goodRes = await request(app)
        .post("/api/v1/delayprofile")
        .send({
          id: 0,
          enableUsenet: true,
          enableTorrent: false,
          preferredProtocol: DownloadProtocol.Usenet,
          usenetDelay: 5,
          torrentDelay: 0,
          bypassIfHighestQuality: false,
          bypassIfAboveCustomFormatScore: false,
          minimumCustomFormatScore: 0,
          order: 0,
          tags: [7],
        });

      expect(goodRes.status).toBe(201);
      expect(goodRes.body.tags).toEqual([7]);
    });

    it("rejects a profile with neither usenet nor torrent enabled", async () => {
      const service = new DelayProfileService(fakeRepository([globalProfile()]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/delayprofile")
        .send({
          id: 0,
          enableUsenet: false,
          enableTorrent: false,
          preferredProtocol: DownloadProtocol.Usenet,
          usenetDelay: 0,
          torrentDelay: 0,
          bypassIfHighestQuality: false,
          bypassIfAboveCustomFormatScore: false,
          minimumCustomFormatScore: 0,
          order: 0,
          tags: [1],
        });

      expect(res.status).toBe(400);
      expect(
        (res.body as { errorMessage: string }[]).some((f) =>
          f.errorMessage.includes("Either Usenet or Torrent")
        )
      ).toBe(true);
    });

    it("rejects negative usenetDelay/torrentDelay", async () => {
      const service = new DelayProfileService(fakeRepository([globalProfile()]));
      const app = buildApp(service);

      const res = await request(app)
        .post("/api/v1/delayprofile")
        .send({
          id: 0,
          enableUsenet: true,
          enableTorrent: false,
          preferredProtocol: DownloadProtocol.Usenet,
          usenetDelay: -1,
          torrentDelay: -1,
          bypassIfHighestQuality: false,
          bypassIfAboveCustomFormatScore: false,
          minimumCustomFormatScore: 0,
          order: 0,
          tags: [1],
        });

      expect(res.status).toBe(400);
      const propertyNames = (res.body as { propertyName: string }[]).map((f) => f.propertyName);
      expect(propertyNames).toContain("usenetDelay");
      expect(propertyNames).toContain("torrentDelay");
    });
  });

  describe("global profile (id 1)", () => {
    it("requires an empty tags set for id 1", async () => {
      const service = new DelayProfileService(fakeRepository([globalProfile()]));
      const app = buildApp(service);

      const res = await request(app)
        .put("/api/v1/delayprofile/1")
        .send({ ...globalProfile(), tags: [1] });

      expect(res.status).toBe(400);
      expect((res.body as { propertyName: string }[]).some((f) => f.propertyName === "tags")).toBe(
        true
      );
    });

    it("cannot be deleted -- 405 MethodNotAllowedException", async () => {
      const service = new DelayProfileService(fakeRepository([globalProfile()]));
      const app = buildApp(service);

      const res = await request(app).delete("/api/v1/delayprofile/1");

      expect(res.status).toBe(405);
    });
  });

  it("DELETE /:id deletes a non-global profile", async () => {
    const repo = fakeRepository([globalProfile(), globalProfile({ id: 2, tags: new Set([1]) })]);
    const service = new DelayProfileService(repo);
    const app = buildApp(service);

    const res = await request(app).delete("/api/v1/delayprofile/2");

    expect(res.status).toBe(200);
    expect(() => service.get(2)).toThrow();
  });

  describe("PUT /reorder/:id", () => {
    it("reorders profiles and returns the full list", async () => {
      const repo = fakeRepository([
        globalProfile({ order: 0 }),
        globalProfile({ id: 2, order: 1, tags: new Set([1]) }),
        globalProfile({ id: 3, order: 2, tags: new Set([2]) }),
      ]);
      const service = new DelayProfileService(repo);
      const app = buildApp(service);

      const res = await request(app).put("/api/v1/delayprofile/reorder/3?afterId=1");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("rejects an invalid id", async () => {
      const service = new DelayProfileService(fakeRepository([globalProfile()]));
      const app = buildApp(service);

      const res = await request(app).put("/api/v1/delayprofile/reorder/0");

      expect(res.status).toBe(400);
    });
  });
});
