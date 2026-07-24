import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { configController } from "../configControllerBase.js";
import type { RestResource } from "../../../rest/RestResource.js";

interface FakeResource extends RestResource {
  retention: number;
}

function makeConfigService(): ConfigService {
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  return new ConfigService(repository);
}

function buildApp(router: ReturnType<typeof configController<FakeResource>>) {
  const app = express();
  app.use(express.json());
  app.use("/config/fake", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("configController", () => {
  it("GET / returns the singleton resource directly (not wrapped in an array), id 1", async () => {
    const configService = makeConfigService();
    const router = configController<FakeResource>({
      configService,
      toResource: (svc) => ({ retention: svc.retention }),
      toDictionary: (r) => ({ retention: r.retention }),
    });
    const app = buildApp(router);

    const res = await request(app).get("/config/fake");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, retention: 0 });
  });

  it("GET /:id ignores the id argument and returns the same singleton", async () => {
    const configService = makeConfigService();
    const router = configController<FakeResource>({
      configService,
      toResource: (svc) => ({ retention: svc.retention }),
      toDictionary: (r) => ({ retention: r.retention }),
    });
    const app = buildApp(router);

    const res = await request(app).get("/config/fake/999");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, retention: 0 });
  });

  it("PUT /:id saves via toDictionary and returns 202 with the re-fetched resource", async () => {
    const configService = makeConfigService();
    const router = configController<FakeResource>({
      configService,
      toResource: (svc) => ({ retention: svc.retention }),
      toDictionary: (r) => ({ retention: r.retention }),
    });
    const app = buildApp(router);

    const res = await request(app).put("/config/fake/1").send({ id: 1, retention: 42 });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: 1, retention: 42 });
    expect(configService.retention).toBe(42);
  });

  it("PUT runs sharedValidator/putValidator and throws ValidationException on failure", async () => {
    const configService = makeConfigService();
    const router = configController<FakeResource>({
      configService,
      toResource: (svc) => ({ retention: svc.retention }),
      toDictionary: (r) => ({ retention: r.retention }),
      sharedValidator: (r) =>
        r.retention < 0 ? [{ propertyName: "retention", errorMessage: "must be >= 0" }] : [],
    });
    const app = buildApp(router);

    const res = await request(app).put("/config/fake/1").send({ id: 1, retention: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([{ propertyName: "retention", errorMessage: "must be >= 0" }]);
  });

  it("PUT validates the route id (BadRequestException if <= 0)", async () => {
    const configService = makeConfigService();
    const router = configController<FakeResource>({
      configService,
      toResource: (svc) => ({ retention: svc.retention }),
      toDictionary: (r) => ({ retention: r.retention }),
    });
    const app = buildApp(router);

    const res = await request(app).put("/config/fake/0").send({ id: 0, retention: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("is not a valid ID");
  });

  it("does not mount POST or DELETE", async () => {
    const configService = makeConfigService();
    const router = configController<FakeResource>({
      configService,
      toResource: (svc) => ({ retention: svc.retention }),
      toDictionary: (r) => ({ retention: r.retention }),
    });
    const app = buildApp(router);

    const postRes = await request(app).post("/config/fake").send({ retention: 1 });
    const deleteRes = await request(app).delete("/config/fake/1");

    expect(postRes.status).toBe(404);
    expect(deleteRes.status).toBe(404);
  });
});
