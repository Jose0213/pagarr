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
import { TagRepository } from "../../../../tags/tagRepository.js";
import { TagService } from "../../../../tags/tagService.js";
import { calendarFeedController } from "../CalendarFeedController.js";

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
  const tagRepo = new TagRepository(db);

  const editionService = new EditionService(editionRepo, events, new NullTextMatcher());
  const bookService = new BookService(bookRepo, editionService, events, new NullTextMatcher());
  const authorService = new AuthorService(authorRepo, events, new NullTextMatcher());
  const tagService = new TagService(tagRepo);

  const router = calendarFeedController({ bookService, authorService, editionService, tagService });
  const app = express();
  app.use("/feed/calendar", router);

  function insertAuthor(name: string, tags: number[] = []) {
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
      tags,
    });
  }

  function insertBook(
    authorMetadataId: number,
    title: string,
    releaseDate: string,
    overview = "",
    genres: string[] = []
  ) {
    return bookService.addBook({
      ...newBook(),
      authorMetadataId,
      foreignBookId: `fb-${title}`,
      titleSlug: title,
      title,
      releaseDate,
      genres,
      monitored: true,
      editions: [
        { ...newEdition(), foreignEditionId: `fe-${title}`, title, overview, monitored: true },
      ],
    });
  }

  return { app, db, insertAuthor, insertBook, tagService };
}

describe("calendarFeedController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("GET /feed/calendar/Readarr.ics returns a valid VCALENDAR with one VEVENT per book", async () => {
    const author = ctx.insertAuthor("Jane Doe");
    const today = new Date();
    const releaseDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).toISOString();
    ctx.insertBook(author.authorMetadataId, "My Book", releaseDate, "A great book", ["Fiction"]);

    const res = await request(ctx.app).get("/feed/calendar/Readarr.ics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/calendar");
    expect(res.text).toContain("BEGIN:VCALENDAR");
    expect(res.text).toContain("PRODID:-//readarr.com//Readarr//EN");
    expect(res.text).toContain("X-WR-CALNAME:Readarr Book Schedule");
    expect(res.text).toContain("BEGIN:VEVENT");
    expect(res.text).toMatch(/UID:Readarr_book_\d+/);
    expect(res.text).toContain("SUMMARY:Jane Doe - My Book");
    expect(res.text).toContain("DESCRIPTION:A great book");
    expect(res.text).toContain("CATEGORIES:Fiction");
    expect(res.text).toContain("END:VEVENT");
    expect(res.text).toContain("END:VCALENDAR");
    expect(res.text).toContain("\r\n"); // CRLF line endings
  });

  it("filters by tagList: only includes books whose author has one of the requested tags", async () => {
    const tag = ctx.tagService.add({ id: 0, label: "scifi" });
    const taggedAuthor = ctx.insertAuthor("Tagged Author", [tag.id]);
    const untaggedAuthor = ctx.insertAuthor("Untagged Author", []);

    const today = new Date();
    const releaseDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).toISOString();
    ctx.insertBook(taggedAuthor.authorMetadataId, "Tagged Book", releaseDate);
    ctx.insertBook(untaggedAuthor.authorMetadataId, "Untagged Book", releaseDate);

    const res = await request(ctx.app)
      .get("/feed/calendar/Readarr.ics")
      .query({ tagList: "scifi" });

    expect(res.text).toContain("Tagged Book");
    expect(res.text).not.toContain("Untagged Book");
  });

  it("escapes commas/semicolons/newlines in free-text fields", async () => {
    const author = ctx.insertAuthor("Author, With Comma");
    const today = new Date();
    const releaseDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).toISOString();
    ctx.insertBook(author.authorMetadataId, "Book; Title", releaseDate, "Line one\nLine two");

    const res = await request(ctx.app).get("/feed/calendar/Readarr.ics");

    expect(res.text).toContain("Author\\, With Comma - Book\\; Title");
    expect(res.text).toContain("Line one\\nLine two");
  });

  it("respects pastDays/futureDays window", async () => {
    const author = ctx.insertAuthor("Windowed Author");
    ctx.insertBook(author.authorMetadataId, "Outside Window", "2000-01-01T00:00:00.000Z");

    const res = await request(ctx.app)
      .get("/feed/calendar/Readarr.ics")
      .query({ pastDays: "1", futureDays: "1" });

    expect(res.text).not.toContain("Outside Window");
  });
});
