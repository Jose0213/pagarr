import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { seriesController } from "../SeriesController.js";
import type { Series, SeriesBookLink } from "../../../../books/models.js";

function buildSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 1,
    foreignSeriesId: "fs-1",
    title: "The Series",
    description: "desc",
    numbered: true,
    workCount: 3,
    primaryWorkCount: 3,
    ...overrides,
  };
}

function buildLink(overrides: Partial<SeriesBookLink> = {}): SeriesBookLink {
  return {
    id: 5,
    position: "1",
    seriesPosition: 1,
    seriesId: 1,
    bookId: 100,
    isPrimary: true,
    ...overrides,
  };
}

function buildApp(deps: Parameters<typeof seriesController>[0]) {
  const app = express();
  app.use(express.json());
  app.use("/series", seriesController(deps));
  return app;
}

describe("seriesController", () => {
  it("GET / returns series for the given authorId with nested links", async () => {
    const getByAuthorId = vi.fn(() => [buildSeries()]);
    const getLinksBySeries = vi.fn(() => [buildLink()]);
    const app = buildApp({
      seriesService: { getByAuthorId },
      seriesBookLinkService: { getLinksBySeries },
    });

    const res = await request(app).get("/series").query("authorId=7");

    expect(res.status).toBe(200);
    expect(getByAuthorId).toHaveBeenCalledWith(7);
    expect(getLinksBySeries).toHaveBeenCalledWith(1);
    expect(res.body).toEqual([
      {
        id: 1,
        title: "The Series",
        description: "desc",
        links: [{ id: 5, position: "1", seriesPosition: 1, seriesId: 1, bookId: 100 }],
      },
    ]);
  });

  it("strips id:0 on both the outer series resource and nested links", async () => {
    const app = buildApp({
      seriesService: { getByAuthorId: () => [buildSeries({ id: 0 })] },
      seriesBookLinkService: { getLinksBySeries: () => [buildLink({ id: 0 })] },
    });

    const res = await request(app).get("/series").query("authorId=7");

    expect(res.body[0].id).toBeUndefined();
    expect(res.body[0].links[0].id).toBeUndefined();
  });

  it("returns an empty array when the author has no series", async () => {
    const app = buildApp({
      seriesService: { getByAuthorId: () => [] },
      seriesBookLinkService: { getLinksBySeries: () => [] },
    });

    const res = await request(app).get("/series").query("authorId=999");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
