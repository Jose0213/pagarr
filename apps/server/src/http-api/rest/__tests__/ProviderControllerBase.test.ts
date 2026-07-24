import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProviderDefinition,
  ProviderFactory,
  type IProvider,
  type IProviderConfig,
  type IProviderRepository,
  type ProviderDefinition,
  type ValidationResult,
} from "../../../thingi-provider/index.js";
import { readarrErrorPipeline } from "../../error-management/ReadarrErrorPipeline.js";
import { providerControllerBase } from "../ProviderControllerBase.js";
import { providerResourceMapper, type ProviderResource } from "../ProviderResource.js";
import type { FieldDefinition } from "../../client-schema/SchemaBuilder.js";

interface MockSettings extends IProviderConfig {
  host: string;
  port: number;
}

function defaultSettings(): MockSettings {
  return {
    host: "",
    port: 0,
    validate: (): ValidationResult => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

const fieldDefs: FieldDefinition<MockSettings>[] = [
  {
    name: "host",
    label: "Host",
    type: "textbox",
    order: 0,
    get: (s) => s.host,
    set: (s, v) => {
      s.host = typeof v === "string" ? v : "";
    },
  },
  {
    name: "port",
    label: "Port",
    type: "number",
    order: 1,
    get: (s) => s.port,
    set: (s, v) => {
      s.port = Number(v ?? 0);
    },
  },
];

function fakeProvider(
  name: string,
  overrides: Partial<IProvider<MockSettings>> = {}
): IProvider<MockSettings> {
  return {
    name,
    configContract: "MockSettings",
    message: null,
    defaultDefinitions: [
      createProviderDefinition<MockSettings>({
        name: "",
        implementation: name,
        configContract: "MockSettings",
        settings: defaultSettings(),
      }),
    ],
    definition: createProviderDefinition<MockSettings>({ name, implementation: name }),
    test: async (): Promise<ValidationResult> => ({
      isValid: true,
      hasWarnings: false,
      errors: [],
    }),
    requestAction: () => ({ ok: true }),
    ...overrides,
  };
}

function inMemoryRepository(): IProviderRepository<ProviderDefinition<MockSettings>> {
  const store = new Map<number, ProviderDefinition<MockSettings>>();
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
      ids.map((id) => store.get(id)).filter((v): v is ProviderDefinition<MockSettings> => !!v),
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    updateMany: (models) => {
      for (const m of models) {
        store.set(m.id, m);
      }
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
    deleteMany: (ids) => {
      for (const id of ids) {
        store.delete(id);
      }
    },
    count: () => store.size,
  };
}

function buildApp() {
  const provider = fakeProvider("MockProvider");
  const repo = inMemoryRepository();
  const providerFactory = new ProviderFactory<IProvider<MockSettings>, MockSettings>(
    repo,
    [provider],
    new Map([["mockprovider", () => fakeProvider("MockProvider")]])
  );

  const router = providerControllerBase({
    providerFactory,
    settingsSchema: { fieldDefs, createDefaultSettings: defaultSettings },
  });

  const app = express();
  app.use(express.json());
  app.use("/provider", router);
  app.use(readarrErrorPipeline());

  return { app, providerFactory };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: "My Provider",
    implementation: "MockProvider",
    configContract: "MockSettings",
    tags: [],
    fields: [
      { name: "host", value: "example.com" },
      { name: "port", value: 9999 },
    ],
    ...overrides,
  };
}

describe("providerControllerBase", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a definition and returns 201 with the mapped resource", async () => {
    const res = await request(ctx.app).post("/provider").send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Provider");
    expect(res.body.implementation).toBe("MockProvider");
    expect(res.body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "host", value: "example.com" })])
    );
  });

  it("SharedValidator rejects an empty name", async () => {
    const res = await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "name" })])
    );
  });

  it("SharedValidator rejects a duplicate name (case-insensitive, ignoring self)", async () => {
    await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "Dup" }));

    const res = await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "DUP" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: "name", errorMessage: "Should be unique" }),
      ])
    );
  });

  it("PostValidator rejects a missing fields array", async () => {
    const body: Record<string, unknown> = validBody();
    delete body["fields"];

    const res = await request(ctx.app).post("/provider").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "fields" })])
    );
  });

  it("GET / returns all definitions sorted by name", async () => {
    await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "Zebra" }));
    await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "Apple" }));

    const res = await request(ctx.app).get("/provider");

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["Apple", "Zebra"]);
  });

  it("GET /:id returns a single mapped resource", async () => {
    const created = await request(ctx.app).post("/provider").send(validBody());

    const res = await request(ctx.app).get(`/provider/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("PUT /:id updates and returns 202", async () => {
    const created = await request(ctx.app).post("/provider").send(validBody());

    const res = await request(ctx.app)
      .put(`/provider/${created.body.id}`)
      .send(validBody({ id: created.body.id, name: "Renamed" }));

    expect(res.status).toBe(202);
    expect(res.body.name).toBe("Renamed");
  });

  it("DELETE /:id removes the definition", async () => {
    const created = await request(ctx.app).post("/provider").send(validBody());

    const del = await request(ctx.app).delete(`/provider/${created.body.id}`);
    expect(del.status).toBe(200);

    const get = await request(ctx.app).get(`/provider/${created.body.id}`);
    expect(get.status).toBe(500); // Not found bubbles as a plain Error from the fake repo -- see note below.
  });

  it("DELETE /:id rejects id <= 0", async () => {
    const res = await request(ctx.app).delete("/provider/0");
    expect(res.status).toBe(400);
  });

  it("GET /schema returns default definitions with presets", async () => {
    const res = await request(ctx.app).get("/provider/schema");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].implementation).toBe("MockProvider");
    expect(res.body[0].presets).toEqual([]);
  });

  it("PUT /bulk requires a non-empty ids array", async () => {
    const res = await request(ctx.app).put("/provider/bulk").send({ ids: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("ids must be provided");
  });

  it("PUT /bulk applies tags with Add/Remove/Replace semantics", async () => {
    const a = await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "A", tags: [1] }));
    const b = await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "B", tags: [2] }));

    const addRes = await request(ctx.app)
      .put("/provider/bulk")
      .send({ ids: [a.body.id, b.body.id], tags: [9], applyTags: "Add" });
    expect(addRes.status).toBe(202);
    const updatedA = (addRes.body as { id: number; tags: number[] }[]).find(
      (r) => r.id === a.body.id
    );
    expect([...(updatedA?.tags ?? [])].sort()).toEqual([1, 9]);

    const replaceRes = await request(ctx.app)
      .put("/provider/bulk")
      .send({ ids: [a.body.id], tags: [42], applyTags: "Replace" });
    expect(replaceRes.body[0].tags).toEqual([42]);

    const removeRes = await request(ctx.app)
      .put("/provider/bulk")
      .send({ ids: [a.body.id], tags: [42], applyTags: "Remove" });
    expect(removeRes.body[0].tags).toEqual([]);
  });

  it("DELETE /bulk removes multiple definitions", async () => {
    const a = await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "A" }));
    const b = await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "B" }));

    const res = await request(ctx.app)
      .delete("/provider/bulk")
      .send({ ids: [a.body.id, b.body.id] });

    expect(res.status).toBe(200);
    expect(ctx.providerFactory.all()).toHaveLength(0);
  });

  it("POST /test runs Test() with SkipValidation(true, false) semantics", async () => {
    const res = await request(ctx.app).post("/provider/test").send(validBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("POST /test still runs sharedValidator (empty name rejected)", async () => {
    const res = await request(ctx.app)
      .post("/provider/test")
      .send(validBody({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("POST /testall tests every enabled+valid definition", async () => {
    await request(ctx.app)
      .post("/provider")
      .send(validBody({ name: "Enabled" }));
    // The one definition created via POST / defaults enable=false per this
    // module's mapper (see ProviderResource.ts) -- so directly seed one
    // enabled definition through the factory to exercise testall's filter.
    ctx.providerFactory.create(
      createProviderDefinition<MockSettings>({
        name: "Direct",
        implementation: "MockProvider",
        configContract: "MockSettings",
        enable: true,
        settings: defaultSettings(),
      })
    );

    const res = await request(ctx.app).post("/provider/testall");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].isValid).toBe(true);
  });

  it("POST /testall returns 400 if any tested definition is invalid", async () => {
    ctx.providerFactory.create(
      createProviderDefinition<MockSettings>({
        name: "Failing",
        implementation: "MockProvider",
        configContract: "MockSettings",
        enable: true,
        settings: defaultSettings(),
      })
    );

    const failingApp = express();
    const repo = inMemoryRepository();
    const failingProvider = fakeProvider("MockProvider", {
      test: async () => ({
        isValid: false,
        hasWarnings: false,
        errors: [{ propertyName: "host", errorMessage: "unreachable" }],
      }),
    });
    const factory = new ProviderFactory<IProvider<MockSettings>, MockSettings>(
      repo,
      [failingProvider],
      new Map([["mockprovider", () => failingProvider]])
    );
    factory.create(
      createProviderDefinition<MockSettings>({
        name: "Failing",
        implementation: "MockProvider",
        configContract: "MockSettings",
        enable: true,
        settings: defaultSettings(),
      })
    );
    const router = providerControllerBase({
      providerFactory: factory,
      settingsSchema: { fieldDefs, createDefaultSettings: defaultSettings },
    });
    failingApp.use(express.json());
    failingApp.use("/provider", router);
    failingApp.use(readarrErrorPipeline());

    const res = await request(failingApp).post("/provider/testall");

    expect(res.status).toBe(400);
    expect(res.body[0].isValid).toBe(false);
  });

  it("POST /action/:name passes through to providerFactory.requestAction", async () => {
    const res = await request(ctx.app).post("/provider/action/dosomething").send(validBody());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("POST /action/:name skips both shared and post validation entirely", async () => {
    const res = await request(ctx.app)
      .post("/provider/action/dosomething")
      .send(validBody({ name: "" })); // would fail sharedValidator if it ran

    expect(res.status).toBe(200);
  });
});

/**
 * Proves the `resourceMapper` extension seam (see ProviderControllerBase.ts's
 * module doc comment's "resourceMapper" section): a caller-supplied mapper
 * with its own extra top-level resource field -- mirroring the real
 * `IndexerResourceMapper : ProviderResourceMapper<IndexerResource,
 * IndexerDefinition>` pattern (`IndexerResource.Priority`/`.EnableRss` etc,
 * layered on top of `base.ToResource(definition)`/`base.ToModel(resource)`)
 * -- round-trips correctly through create/update/get, WITHOUT needing
 * `Indexers/IndexerController.ts`'s `router.use(baseRouter)` delegation
 * workaround or `resources/extraProviderFields.ts`'s middleware-hoisting
 * workaround. This is the seam both `port/api-indexers-search` and
 * `port/api-download-notifications` independently worked around before
 * this fix landed.
 */
describe("providerControllerBase -- resourceMapper extension seam", () => {
  /** A `ProviderDefinition<MockSettings>` widened with one extra field, mirroring `IndexerProviderDefinition`'s relationship to the generic base. */
  interface MockWideDefinition extends ProviderDefinition<MockSettings> {
    priority: number;
  }

  /** A `ProviderResource` widened with the same extra field, mirroring `IndexerResource`. */
  interface MockWideResource extends ProviderResource {
    priority: number;
  }

  function buildSeamApp() {
    const provider = fakeProvider("MockProvider");
    const repo = inMemoryRepository();
    const providerFactory = new ProviderFactory<IProvider<MockSettings>, MockSettings>(
      repo,
      [provider],
      new Map([["mockprovider", () => fakeProvider("MockProvider")]])
    );

    const base = providerResourceMapper<MockSettings>({
      fieldDefs,
      createDefaultSettings: defaultSettings,
    });

    // Mirrors indexerResourceMapper()'s exact shape: wrap the generic base
    // mapper, layer one extra top-level field on top in both directions.
    const wideMapper = {
      toResource(definition: MockWideDefinition): MockWideResource {
        const resource = base.toResource(definition) as MockWideResource;
        resource.priority = definition.priority;
        return resource;
      },
      toModel(resource: MockWideResource | null | undefined): MockWideDefinition {
        const model = base.toModel(resource) as MockWideDefinition;
        model.priority = resource?.priority ?? 25;
        return model;
      },
    };

    const router = providerControllerBase({
      providerFactory,
      settingsSchema: { fieldDefs, createDefaultSettings: defaultSettings },
      resourceMapper: wideMapper,
    });

    const app = express();
    app.use(express.json());
    app.use("/provider", router);
    app.use(readarrErrorPipeline());

    return { app, providerFactory };
  }

  function validSeamBody(overrides: Record<string, unknown> = {}) {
    return {
      id: 0,
      name: "My Provider",
      implementation: "MockProvider",
      configContract: "MockSettings",
      tags: [],
      priority: 10,
      fields: [
        { name: "host", value: "example.com" },
        { name: "port", value: 9999 },
      ],
      ...overrides,
    };
  }

  it("POST / round-trips the custom mapper's extra field (priority) in the 201 response", async () => {
    const { app } = buildSeamApp();

    const res = await request(app)
      .post("/provider")
      .send(validSeamBody({ priority: 42 }));

    expect(res.status).toBe(201);
    expect(res.body.priority).toBe(42);
    expect(res.body.name).toBe("My Provider");
  });

  it("GET /:id returns the extra field after create", async () => {
    const { app } = buildSeamApp();

    const created = await request(app)
      .post("/provider")
      .send(validSeamBody({ priority: 7 }));
    const res = await request(app).get(`/provider/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.priority).toBe(7);
  });

  it("PUT /:id updates the extra field and returns it in the 202 response", async () => {
    const { app } = buildSeamApp();

    const created = await request(app)
      .post("/provider")
      .send(validSeamBody({ priority: 1 }));
    const res = await request(app)
      .put(`/provider/${created.body.id}`)
      .send(validSeamBody({ id: created.body.id, priority: 33 }));

    expect(res.status).toBe(202);
    expect(res.body.priority).toBe(33);

    const refetched = await request(app).get(`/provider/${created.body.id}`);
    expect(refetched.body.priority).toBe(33);
  });

  it("GET / lists the extra field on every definition", async () => {
    const { app } = buildSeamApp();
    await request(app)
      .post("/provider")
      .send(validSeamBody({ name: "A", priority: 5 }));
    await request(app)
      .post("/provider")
      .send(validSeamBody({ name: "B", priority: 9 }));

    const res = await request(app).get("/provider");

    expect(res.status).toBe(200);
    const priorities = (res.body as { name: string; priority: number }[])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => r.priority);
    expect(priorities).toEqual([5, 9]);
  });

  it("omitting resourceMapper still uses the generic default mapper (backward compatible)", async () => {
    const provider = fakeProvider("MockProvider");
    const repo = inMemoryRepository();
    const providerFactory = new ProviderFactory<IProvider<MockSettings>, MockSettings>(
      repo,
      [provider],
      new Map([["mockprovider", () => fakeProvider("MockProvider")]])
    );
    const router = providerControllerBase({
      providerFactory,
      settingsSchema: { fieldDefs, createDefaultSettings: defaultSettings },
    });
    const app = express();
    app.use(express.json());
    app.use("/provider", router);
    app.use(readarrErrorPipeline());

    const res = await request(app).post("/provider").send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.priority).toBeUndefined();
  });
});
