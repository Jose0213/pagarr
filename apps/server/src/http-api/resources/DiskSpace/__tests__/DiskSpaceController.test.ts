import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { IDiskSpaceService } from "../../../../disk-space/diskSpaceService.js";
import { diskSpaceController } from "../DiskSpaceController.js";

describe("diskSpaceController", () => {
  it("GET / returns free-space entries, id stripped since it's always 0", async () => {
    const diskSpaceService: IDiskSpaceService = {
      getFreeSpace: () => [{ path: "/books", label: "", freeSpace: 100, totalSpace: 1000 }],
    };
    const router = diskSpaceController({ diskSpaceService });
    const app = express();
    app.use("/diskspace", router);

    const res = await request(app).get("/diskspace");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ path: "/books", label: "", freeSpace: 100, totalSpace: 1000 }]);
    expect(res.body[0].id).toBeUndefined();
  });

  it("GET / returns an empty array when there's no free space to report", async () => {
    const diskSpaceService: IDiskSpaceService = { getFreeSpace: () => [] };
    const router = diskSpaceController({ diskSpaceService });
    const app = express();
    app.use("/diskspace", router);

    const res = await request(app).get("/diskspace");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
