import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../../../books/__tests__/testDb.js";
import type { MainDatabase } from "../../../../db/db-factory.js";
import { BookRepository } from "../../../../books/bookRepository.js";
import { EditionRepository } from "../../../../books/editionRepository.js";
import { AuthorRepository } from "../../../../books/authorRepository.js";
import { AuthorMetadataRepository } from "../../../../books/authorMetadataRepository.js";
import { BookService } from "../../../../books/bookService.js";
import { EditionService } from "../../../../books/editionService.js";
import { AuthorService } from "../../../../books/authorService.js";
import { NullTextMatcher } from "../../../../books/textMatching.js";
import { newAuthor, newAuthorMetadata, newBook, newEdition } from "../../../../books/models.js";
import type { BooksDomainEvent, IBooksEventAggregator } from "../../../../books/events.js";
import { calendarController } from "../CalendarController.js";

class NullBooksEventAggregator implements IBooksEventAggregator {
  publishEvent(_event: BooksDomainEvent): void {}
}

function buildApp() {
  const db: MainDatabase = createTestDatabase();
  const events = new NullBooksEventAggregator();

  const bookRepo = new BookRepository(db);
  const editionRepo = new EditionRepository(db);
  const authorRepo = new AuthorRepository(db);
  const metaRepo = new AuthorMetadataRepository(db);

  const editionService = new EditionService(editionRepo, events, new NullTextMatcher());
  const bookService = new BookService(bookRepo, editionService, events, new NullTextMatcher());
  const authorService = new AuthorService(authorRepo, events, new NullTextMatcher());

  const router = calendarController({ bookService, authorService, editionService });
  const app = express();
  app.use("/calendar", router);

  function insertAuthor(name: string) {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: `fa-${name}`,
      titleSlug: name,
      name,
    });
    return authorRepo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: name.toLowerCase(),
      path: `/books/${name}`,
      monitored: true,
    });
  }

  function insertBook(
    authorMetadataId: number,
    title: string,
    releaseDate: string,
    monitored = true
  ) {
    const book = bookService.addBook({
      ...newBook(),
      authorMetadataId,
      foreignBookId: `fb-${title}`,
      titleSlug: title,
      title,
      releaseDate,
      monitored,
      editions: [{ ...newEdition(), foreignEditionId: `fe-${title}`, title, monitored: true }],
    });
    return book;
  }

  return { app, db, insertAuthor, insertBook };
}

describe("calendarController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("GET /calendar defaults to today..today+2 and returns books in that window", async () => {
    const author = ctx.insertAuthor("Author One");
    const today = new Date();
    const releaseDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    ).toISOString();
    ctx.insertBook(author.authorMetadataId, "Book One", releaseDate);

    const res = await request(ctx.app).get("/calendar");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Book One");
    expect(res.body[0].author).toBeUndefined();
  });

  it("respects explicit start/end query params", async () => {
    const author = ctx.insertAuthor("Author Two");
    ctx.insertBook(author.authorMetadataId, "Far Future Book", "2030-06-15T00:00:00.000Z");

    const res = await request(ctx.app)
      .get("/calendar")
      .query({ start: "2030-06-01T00:00:00.000Z", end: "2030-06-30T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Far Future Book");
  });

  it("excludes unmonitored books/authors unless unmonitored=true", async () => {
    const author = ctx.insertAuthor("Author Three");
    const releaseDate = "2030-07-01T00:00:00.000Z";
    ctx.insertBook(author.authorMetadataId, "Unmonitored Book", releaseDate, false);

    const filtered = await request(ctx.app)
      .get("/calendar")
      .query({ start: "2030-06-25T00:00:00.000Z", end: "2030-07-05T00:00:00.000Z" });
    expect(filtered.body).toHaveLength(0);

    const unfiltered = await request(ctx.app).get("/calendar").query({
      start: "2030-06-25T00:00:00.000Z",
      end: "2030-07-05T00:00:00.000Z",
      unmonitored: "true",
    });
    expect(unfiltered.body).toHaveLength(1);
  });

  it("includeAuthor=true attaches a minimal author resource", async () => {
    const author = ctx.insertAuthor("Author Four");
    ctx.insertBook(author.authorMetadataId, "Book Four", "2030-08-01T00:00:00.000Z");

    const res = await request(ctx.app).get("/calendar").query({
      start: "2030-07-25T00:00:00.000Z",
      end: "2030-08-05T00:00:00.000Z",
      includeAuthor: "true",
    });

    expect(res.status).toBe(200);
    expect(res.body[0].author).toMatchObject({ authorName: "Author Four" });
  });

  it("sorts results by release date ascending", async () => {
    const author = ctx.insertAuthor("Author Five");
    ctx.insertBook(author.authorMetadataId, "Later Book", "2030-09-10T00:00:00.000Z");
    ctx.insertBook(author.authorMetadataId, "Earlier Book", "2030-09-05T00:00:00.000Z");

    const res = await request(ctx.app)
      .get("/calendar")
      .query({ start: "2030-09-01T00:00:00.000Z", end: "2030-09-30T00:00:00.000Z" });

    expect((res.body as { title: string }[]).map((b) => b.title)).toEqual([
      "Earlier Book",
      "Later Book",
    ]);
  });
});
