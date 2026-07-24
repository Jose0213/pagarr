import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  IDownloadClient,
  IDownloadClientRepository,
} from "../../../../download-clients/index.js";
import { createDownloadClientDefinition } from "../../../../download-clients/DownloadClientDefinition.js";
import { createQBittorrentSettings } from "../../../../download-clients/qbittorrent/QBittorrentSettings.js";
import { createSabnzbdSettings } from "../../../../download-clients/sabnzbd/SabnzbdSettings.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { downloadClientController } from "../DownloadClientController.js";
import type { DownloadClientDefinition } from "../../../../download-clients/DownloadClientDefinition.js";

/**
 * Tests for `downloadClientController()` -- exercises the real
 * `providerControllerBase()` routes wired against a real
 * `thingi-provider/ProviderFactory` (via this module's adapters) plus this
 * task's own extra-field-shuttling behavior for `enable`/`protocol`/
 * `priority`/`removeCompletedDownloads`/`removeFailedDownloads` (the sibling
 * JSON fields the real C# `DownloadClientResource` carries -- see
 * `DownloadClientResource.ts`'s doc comment).
 */

function inMemoryRepository(): IDownloadClientRepository {
  const store = new Map<number, DownloadClientDefinition>();
  let nextId = 1;

  return {
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => {
      const found = store.get(id);
      if (!found) {
        throw new Error(`not found: ${id}`);
      }
      return found;
    },
    getMany: (ids) =>
      ids.map((id) => store.get(id)).filter((v): v is DownloadClientDefinition => !!v),
    findByName: (name) => [...store.values()].find((v) => v.name === name),
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    upsert: (model) => {
      if (model.id === 0) {
        const withId = { ...model, id: nextId++ };
        store.set(withId.id, withId);
        return withId;
      }
      store.set(model.id, model);
      return model;
    },
    delete: (id) => {
      store.delete(id);
    },
    count: () => store.size,
  };
}

function fakeQBittorrent(): IDownloadClient {
  return {
    name: "qBittorrent",
    protocol: 2,
    definition: createDownloadClientDefinition({
      implementation: "qBittorrent",
      configContract: "QBittorrentSettings",
      settings: createQBittorrentSettings(),
    }),
    download: () => Promise.resolve(null),
    getItems: () => [],
    getImportItem: (item) => item,
    removeItem: () => {},
    getStatus: () => ({
      isLocalhost: true,
      removesCompletedDownloads: false,
      outputRootFolders: [],
    }),
    markItemAsImported: () => {},
    test: () => Promise.resolve({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => ({ ok: true }),
  };
}

function fakeSabnzbd(): IDownloadClient {
  return {
    name: "SABnzbd",
    protocol: 1,
    definition: createDownloadClientDefinition({
      implementation: "SABnzbd",
      configContract: "SabnzbdSettings",
      settings: createSabnzbdSettings(),
    }),
    download: () => Promise.resolve(null),
    getItems: () => [],
    getImportItem: (item) => item,
    removeItem: () => {},
    getStatus: () => ({
      isLocalhost: true,
      removesCompletedDownloads: false,
      outputRootFolders: [],
    }),
    markItemAsImported: () => {},
    test: () => Promise.resolve({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => ({ ok: true }),
  };
}

function buildApp() {
  const repository = inMemoryRepository();
  const router = downloadClientController({
    repository,
    providers: [fakeQBittorrent(), fakeSabnzbd()],
  });

  const app = express();
  app.use(express.json());
  app.use("/downloadclient", router);
  app.use(readarrErrorPipeline());

  return { app, repository };
}

function qbitBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: "My qBittorrent",
    implementation: "qBittorrent",
    configContract: "QBittorrentSettings",
    tags: [],
    enable: true,
    protocol: 2,
    priority: 1,
    removeCompletedDownloads: true,
    removeFailedDownloads: true,
    fields: [
      { name: "host", value: "localhost" },
      { name: "port", value: 8080 },
    ],
    ...overrides,
  };
}

describe("downloadClientController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a download client and returns the real wire shape (enable/protocol/priority/remove* as siblings, not inside fields)", async () => {
    const res = await request(ctx.app).post("/downloadclient").send(qbitBody());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My qBittorrent");
    expect(res.body.enable).toBe(true);
    expect(res.body.priority).toBe(1);
    expect(res.body.removeCompletedDownloads).toBe(true);
    expect(res.body.removeFailedDownloads).toBe(true);
    // Reserved shuttling fields must never leak into the visible fields[] array.
    const fieldNames = (res.body.fields as { name: string }[]).map((f) => f.name);
    expect(fieldNames.every((n) => !n.startsWith("$$"))).toBe(true);
    // Real settings fields round-trip.
    expect(res.body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "host", value: "localhost" })])
    );
  });

  it("persists enable=true across a GET after creation (not hardcoded false)", async () => {
    const created = await request(ctx.app).post("/downloadclient").send(qbitBody());

    const res = await request(ctx.app).get(`/downloadclient/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.enable).toBe(true);
  });

  it("GET / lists created download clients sorted by name, with extra fields visible", async () => {
    await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ name: "Zebra" }));
    await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ name: "Apple", priority: 25 }));

    const res = await request(ctx.app).get("/downloadclient");

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["Apple", "Zebra"]);
    const apple = (res.body as { name: string; priority: number }[]).find(
      (r) => r.name === "Apple"
    );
    expect(apple?.priority).toBe(25);
  });

  it("PUT /:id updates enable/priority and returns 202", async () => {
    const created = await request(ctx.app).post("/downloadclient").send(qbitBody());

    const res = await request(ctx.app)
      .put(`/downloadclient/${created.body.id}`)
      .send(qbitBody({ id: created.body.id, enable: false, priority: 10 }));

    expect(res.status).toBe(202);
    expect(res.body.enable).toBe(false);
    expect(res.body.priority).toBe(10);
  });

  it("SharedValidator rejects priority outside 1..50 (InclusiveBetween(1, 50))", async () => {
    const res = await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ priority: 51 }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "priority" })])
    );
  });

  it("SharedValidator accepts priority at the boundaries (1 and 50)", async () => {
    const low = await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ name: "Low", priority: 1 }));
    const high = await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ name: "High", priority: 50 }));

    expect(low.status).toBe(201);
    expect(high.status).toBe(201);
  });

  it("DELETE /:id removes the download client", async () => {
    const created = await request(ctx.app).post("/downloadclient").send(qbitBody());

    const del = await request(ctx.app).delete(`/downloadclient/${created.body.id}`);
    expect(del.status).toBe(200);
    expect(ctx.repository.all()).toHaveLength(0);
  });

  it("GET /schema returns default definitions for every known implementation with extra fields defaulted", async () => {
    const res = await request(ctx.app).get("/downloadclient/schema");

    expect(res.status).toBe(200);
    const implementations = (res.body as { implementation: string }[]).map((r) => r.implementation);
    expect(implementations).toEqual(expect.arrayContaining(["qBittorrent", "SABnzbd"]));

    const qbit = (
      res.body as { implementation: string; priority: number; removeCompletedDownloads: boolean }[]
    ).find((r) => r.implementation === "qBittorrent");
    expect(qbit?.priority).toBe(1);
    expect(qbit?.removeCompletedDownloads).toBe(true);
  });

  it("PUT /bulk applies enable/priority/remove* across multiple definitions", async () => {
    const a = await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ name: "A" }));
    const b = await request(ctx.app)
      .post("/downloadclient")
      .send(qbitBody({ name: "B" }));

    const res = await request(ctx.app)
      .put("/downloadclient/bulk")
      .send({ ids: [a.body.id, b.body.id], enable: false, priority: 33 });

    expect(res.status).toBe(202);
    for (const item of res.body as { enable: boolean; priority: number }[]) {
      expect(item.enable).toBe(false);
      expect(item.priority).toBe(33);
    }
  });

  it("POST /test runs against a not-yet-saved definition", async () => {
    const res = await request(ctx.app).post("/downloadclient/test").send(qbitBody());
    expect(res.status).toBe(200);
  });
});
