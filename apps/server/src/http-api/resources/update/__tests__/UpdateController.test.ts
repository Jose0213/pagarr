import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { getRecentUpdates, updateController } from "../UpdateController.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/update", updateController());
  app.use(readarrErrorPipeline());
  return app;
}

describe("updateController", () => {
  it("GET / returns an empty array (no self-update mechanism in this port)", async () => {
    const app = makeApp();

    const res = await request(app).get("/api/v1/update");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("does not mount POST/PUT/DELETE", async () => {
    const app = makeApp();

    const postRes = await request(app).post("/api/v1/update").send({});
    const putRes = await request(app).put("/api/v1/update/1").send({});
    const deleteRes = await request(app).delete("/api/v1/update/1");

    expect(postRes.status).toBe(404);
    expect(putRes.status).toBe(404);
    expect(deleteRes.status).toBe(404);
  });
});

describe("getRecentUpdates", () => {
  it("always returns an empty array", () => {
    expect(getRecentUpdates()).toEqual([]);
  });
});
