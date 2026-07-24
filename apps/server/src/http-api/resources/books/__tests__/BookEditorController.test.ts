import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { bookEditorController } from "../BookEditorController.js";
import type { Book } from "../../../../books/models.js";

function buildBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    authorMetadataId: 10,
    foreignBookId: "fb-1",
    titleSlug: "slug",
    title: "Book Title",
    releaseDate: null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "book title",
    monitored: false,
    anyEditionOk: false,
    lastInfoSync: null,
    added: null,
    addOptions: { addType: "Automatic" as never, searchForNewBook: false },
    ...overrides,
  };
}

function buildApp(deps: Parameters<typeof bookEditorController>[0]) {
  const app = express();
  app.use(express.json());
  app.use("/book/editor", bookEditorController(deps));
  return app;
}

describe("bookEditorController", () => {
  describe("PUT /", () => {
    it("bulk-updates monitored on the fetched books and returns 202", async () => {
      const book1 = buildBook({ id: 1, monitored: false });
      const book2 = buildBook({ id: 2, monitored: false });
      const getBooks = vi.fn(() => [book1, book2]);
      const updateMany = vi.fn();

      const app = buildApp({ bookService: { getBooks, updateMany, deleteBook: vi.fn() } });

      const res = await request(app)
        .put("/book/editor")
        .send({ bookIds: [1, 2], monitored: true });

      expect(res.status).toBe(202);
      expect(getBooks).toHaveBeenCalledWith([1, 2]);
      expect(book1.monitored).toBe(true);
      expect(book2.monitored).toBe(true);
      expect(updateMany).toHaveBeenCalledWith([book1, book2]);
      expect(res.body).toHaveLength(2);
    });

    it("leaves monitored untouched when the field is omitted from the request", async () => {
      const book1 = buildBook({ id: 1, monitored: true });
      const app = buildApp({
        bookService: { getBooks: () => [book1], updateMany: vi.fn(), deleteBook: vi.fn() },
      });

      await request(app)
        .put("/book/editor")
        .send({ bookIds: [1] });

      expect(book1.monitored).toBe(true);
    });
  });

  describe("DELETE /", () => {
    it("deletes each bookId with the given flags", async () => {
      const deleteBook = vi.fn();
      const app = buildApp({
        bookService: { getBooks: vi.fn(), updateMany: vi.fn(), deleteBook },
      });

      const res = await request(app)
        .delete("/book/editor")
        .send({ bookIds: [1, 2], deleteFiles: true, addImportListExclusion: true });

      expect(res.status).toBe(200);
      expect(deleteBook).toHaveBeenCalledTimes(2);
      expect(deleteBook).toHaveBeenNthCalledWith(1, 1, true, true);
      expect(deleteBook).toHaveBeenNthCalledWith(2, 2, true, true);
    });

    it("defaults deleteFiles/addImportListExclusion to false when omitted", async () => {
      const deleteBook = vi.fn();
      const app = buildApp({
        bookService: { getBooks: vi.fn(), updateMany: vi.fn(), deleteBook },
      });

      await request(app)
        .delete("/book/editor")
        .send({ bookIds: [5] });

      expect(deleteBook).toHaveBeenCalledWith(5, false, false);
    });
  });
});
