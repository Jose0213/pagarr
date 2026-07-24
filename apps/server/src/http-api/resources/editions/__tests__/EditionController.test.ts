import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { editionController } from "../EditionController.js";
import type { Edition } from "../../../../books/models.js";

function buildEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 1,
    bookId: 10,
    foreignEditionId: "fe-1",
    titleSlug: "slug",
    isbn13: null,
    asin: null,
    title: "Edition Title",
    language: "eng",
    overview: "",
    format: null,
    isEbook: false,
    disambiguation: null,
    publisher: null,
    pageCount: 100,
    releaseDate: null,
    images: [],
    links: [],
    ratings: { votes: 0, value: 0 },
    monitored: true,
    manualAdd: false,
    ...overrides,
  };
}

function buildApp(getEditionsByBook: (bookIds: number[]) => Edition[]) {
  const app = express();
  app.use(express.json());
  app.use("/edition", editionController({ editionService: { getEditionsByBook } }));
  return app;
}

describe("editionController", () => {
  it("GET / returns editions for the given bookId query params", async () => {
    const getEditionsByBook = vi.fn((bookIds: number[]) =>
      bookIds.map((id) => buildEdition({ id, bookId: id }))
    );
    const app = buildApp(getEditionsByBook);

    const res = await request(app).get("/edition").query("bookId=10&bookId=11");

    expect(res.status).toBe(200);
    expect(getEditionsByBook).toHaveBeenCalledWith([10, 11]);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 10, bookId: 10 });
  });

  it("GET / with no bookId query params returns an empty array without calling the service with garbage", async () => {
    const getEditionsByBook = vi.fn(() => []);
    const app = buildApp(getEditionsByBook);

    const res = await request(app).get("/edition");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(getEditionsByBook).toHaveBeenCalledWith([]);
  });

  it("strips id:0 from the wire response (RestResource convention)", async () => {
    const app = buildApp(() => [buildEdition({ id: 0 })]);

    const res = await request(app).get("/edition").query("bookId=10");

    expect(res.body[0].id).toBeUndefined();
  });
});
