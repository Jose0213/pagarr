import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newAuthor, newAuthorMetadata, newBook } from "../../../../books/models.js";
import type { ParsingService } from "../../../../parser/parsingService.js";
import { newRemoteBook } from "../../../../parser/model/remoteBook.js";
import { parseController } from "../ParseController.js";

function buildApp(mapImpl?: ParsingService["map"]) {
  const parsingService = {
    map: mapImpl ?? vi.fn(() => newRemoteBook()),
  } as unknown as ParsingService;

  const router = parseController({ parsingService });

  const app = express();
  app.use("/parse", router);
  app.use(readarrErrorPipeline());

  return { app, parsingService };
}

describe("parseController", () => {
  it("GET /?title= (empty/absent) returns null with 200", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app).get("/parse");

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("GET /?title=whitespace returns null", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app).get("/parse?title=%20%20");

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("an unparseable title returns a title-only ParseResource (parsedBookInfo: null)", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app).get(
      "/parse?title=" + encodeURIComponent("thebiggestloser1618finale")
    );

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("thebiggestloser1618finale");
    expect(res.body.parsedBookInfo).toBeNull();
  });

  it("a parseable title maps through ParsingService.map and returns author/books", async () => {
    const author = {
      ...newAuthor(),
      id: 1,
      metadata: { ...newAuthorMetadata(), id: 1, name: "Jay-Z" },
    };
    const book = { ...newBook(), id: 2, title: "4:44", foreignBookId: "fb-1" };

    const map = vi.fn(() => ({
      ...newRemoteBook(),
      parsedBookInfo: { authorName: "Jay-Z", bookTitle: "4:44" } as never,
      author,
      books: [book],
    }));
    const ctx = buildApp(map);

    const res = await request(ctx.app).get(
      "/parse?title=" + encodeURIComponent("Jay-Z - 4:44 (Deluxe Edition) (2017) 320")
    );

    expect(res.status).toBe(200);
    expect(map).toHaveBeenCalled();
    expect(res.body.title).toBe("Jay-Z - 4:44 (Deluxe Edition) (2017) 320");
    expect(res.body.author.authorName).toBe("Jay-Z");
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].title).toBe("4:44");
  });

  it("when the mapped RemoteBook has no author, author is omitted from the resource", async () => {
    const map = vi.fn(() => ({
      ...newRemoteBook(),
      parsedBookInfo: { authorName: "Jay-Z", bookTitle: "4:44" } as never,
      author: null,
      books: [],
    }));
    const ctx = buildApp(map);

    const res = await request(ctx.app).get(
      "/parse?title=" + encodeURIComponent("Jay-Z - 4:44 (Deluxe Edition) (2017) 320")
    );

    expect(res.status).toBe(200);
    expect(res.body.author).toBeUndefined();
    expect(res.body.books).toEqual([]);
  });
});
