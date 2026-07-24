import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { bookController } from "../BookController.js";
import type { BookControllerDeps } from "../BookController.js";
import type { Author, Book } from "../../../../books/models.js";
import { NewItemMonitorTypes } from "../../../../books/models.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { ModelNotFoundException } from "../../../../db/errors.js";

function buildAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 10,
    cleanName: "author",
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "/books/author",
    rootFolderPath: "/books",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    metadata: {
      id: 10,
      foreignAuthorId: "fa-1",
      titleSlug: "author-slug",
      name: "Author Name",
      sortName: "name, author",
      nameLastFirst: "Name, Author",
      sortNameLastFirst: "name, author",
      aliases: [],
      overview: null,
      disambiguation: null,
      gender: null,
      hometown: null,
      born: null,
      died: null,
      status: 0,
      images: [],
      links: [],
      genres: [],
      ratings: { votes: 0, value: 0 },
    },
    ...overrides,
  };
}

function buildBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    authorMetadataId: 10,
    foreignBookId: "fb-1",
    titleSlug: "book-slug",
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

function fakeSignalRBroadcaster(): SignalRBroadcaster {
  return {
    isConnected: false,
    broadcastResourceChange: vi.fn(),
  } as unknown as SignalRBroadcaster;
}

interface Deps extends BookControllerDeps {
  __books: Map<number, Book>;
}

function buildDeps(overrides: Partial<BookControllerDeps> = {}): Deps {
  const books = new Map<number, Book>();
  const author = buildAuthor();

  const bookService = {
    getBook: vi.fn((id: number) => {
      const book = books.get(id);
      if (!book) {
        throw new ModelNotFoundException("Books", id);
      }
      return book;
    }),
    getBooks: vi.fn((ids: number[]) => ids.map((id) => books.get(id)!)),
    getBooksByAuthor: vi.fn(() => [...books.values()]),
    getAllBooks: vi.fn(() => [...books.values()]),
    findBySlug: vi.fn((slug: string) => [...books.values()].find((b) => b.titleSlug === slug)),
    updateBook: vi.fn((book: Book) => {
      books.set(book.id, book);
      return book;
    }),
    deleteBook: vi.fn((id: number) => {
      books.delete(id);
    }),
    setMonitored: vi.fn(),
    setBookMonitored: vi.fn(),
  } as unknown as BookControllerDeps["bookService"];

  const deps: Deps = {
    authorService: {
      getAuthor: vi.fn(() => author),
      getAllAuthors: vi.fn(() => [author]),
      getAuthorByMetadataId: vi.fn(() => author),
    },
    bookService,
    addBookService: {
      addBook: vi.fn((book: Book) => {
        const created = { ...book, id: books.size + 1 };
        books.set(created.id, created);
        return created;
      }),
    },
    editionService: {
      getAllMonitoredEditions: vi.fn(() => []),
      getEditionsByAuthor: vi.fn(() => []),
      getEditionsByBook: vi.fn(() => []),
      updateMany: vi.fn(),
    },
    seriesBookLinkService: {
      getLinksByBook: vi.fn(() => []),
    },
    authorStatisticsService: {
      authorStatistics: vi.fn(() => []),
      authorStatisticsByAuthor: vi.fn(() => ({
        authorId: 1,
        bookFileCount: 0,
        bookCount: 0,
        availableBookCount: 0,
        totalBookCount: 0,
        sizeOnDisk: 0,
        bookStatistics: [],
      })),
    },
    coverMapper: {
      convertToLocalUrls: vi.fn(),
    },
    qualityProfileExistsValidator: { exists: () => true },
    metadataProfileExistsValidator: { exists: () => true },
    eventAggregator: new EventAggregator(),
    signalRBroadcaster: fakeSignalRBroadcaster(),
    __books: books,
    ...overrides,
  };

  return deps;
}

function buildApp(deps: Deps) {
  const { router } = bookController(deps);
  const app = express();
  app.use(express.json());
  app.use("/book", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("bookController", () => {
  describe("GET / (happy path)", () => {
    it("returns all books mapped with statistics/cover-mapping applied when no filters are given", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      const app = buildApp(deps);

      const res = await request(app).get("/book");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(1);
      expect(deps.coverMapper.convertToLocalUrls).toHaveBeenCalled();
    });

    it("filters by authorId when given", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      const app = buildApp(deps);

      const res = await request(app).get("/book").query("authorId=1");

      expect(res.status).toBe(200);
      expect(deps.bookService.getBooksByAuthor).toHaveBeenCalledWith(1);
    });

    it("filters by titleSlug, returning a single book by default", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1, titleSlug: "target-slug" }));
      const app = buildApp(deps);

      const res = await request(app).get("/book").query("titleSlug=target-slug");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].titleSlug).toBe("target-slug");
    });

    it("returns an empty array for an unknown titleSlug", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app).get("/book").query("titleSlug=nonexistent");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("falls back to bookIds filter when no other query params are given", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      deps.__books.set(2, buildBook({ id: 2 }));
      const app = buildApp(deps);

      const res = await request(app).get("/book").query("bookIds=1&bookIds=2");

      expect(res.status).toBe(200);
      expect(deps.bookService.getBooks).toHaveBeenCalledWith([1, 2]);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("GET /:id", () => {
    it("returns a single book with author embedded", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      const app = buildApp(deps);

      const res = await request(app).get("/book/1");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.author).toBeDefined();
    });

    it("404s for a book id that doesn't exist", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app).get("/book/999");

      expect(res.status).toBe(404);
    });
  });

  describe("GET /:id/overview", () => {
    it("returns the monitored edition's overview", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      deps.editionService.getEditionsByBook = vi.fn(() => [
        {
          id: 1,
          bookId: 1,
          foreignEditionId: "fe-1",
          titleSlug: "ed-slug",
          isbn13: null,
          asin: null,
          title: "Edition",
          language: null,
          overview: "the overview",
          format: null,
          isEbook: false,
          disambiguation: null,
          publisher: null,
          pageCount: 0,
          releaseDate: null,
          images: [],
          links: [],
          ratings: { votes: 0, value: 0 },
          monitored: true,
          manualAdd: false,
        },
      ]);
      const app = buildApp(deps);

      const res = await request(app).get("/book/1/overview");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 1, overview: "the overview" });
    });
  });

  describe("POST / (create)", () => {
    it("creates a book via addBookService and returns 201", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app)
        .post("/book")
        .send({
          id: 0,
          foreignBookId: "fb-new",
          title: "New Book",
          author: {
            id: 0,
            qualityProfileId: 1,
            metadataProfileId: 1,
            path: "/books/author",
            foreignAuthorId: "fa-new",
          },
        });

      expect(res.status).toBe(201);
      expect(deps.addBookService.addBook).toHaveBeenCalled();
      expect(res.body.id).toBeDefined();
    });

    it("validation-failure: rejects a missing foreignBookId", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app)
        .post("/book")
        .send({
          id: 0,
          title: "New Book",
          author: {
            id: 0,
            qualityProfileId: 1,
            metadataProfileId: 1,
            path: "/books/author",
            foreignAuthorId: "fa-new",
          },
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ propertyName: "foreignBookId" })])
      );
    });

    it("validation-failure: rejects a nonexistent qualityProfileId", async () => {
      const deps = buildDeps({
        qualityProfileExistsValidator: { exists: () => false },
      });
      const app = buildApp(deps);

      const res = await request(app)
        .post("/book")
        .send({
          id: 0,
          foreignBookId: "fb-new",
          title: "New Book",
          author: {
            id: 0,
            qualityProfileId: 999,
            metadataProfileId: 1,
            path: "/books/author",
            foreignAuthorId: "fa-new",
          },
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ propertyName: "author.qualityProfileId" }),
        ])
      );
    });

    it("validation-failure: requires a valid rootFolderPath when author.path is blank", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app)
        .post("/book")
        .send({
          id: 0,
          foreignBookId: "fb-new",
          title: "New Book",
          author: {
            id: 0,
            qualityProfileId: 1,
            metadataProfileId: 1,
            path: "",
            rootFolderPath: "not-a-real-path",
            foreignAuthorId: "fa-new",
          },
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ propertyName: "author.rootFolderPath" })])
      );
    });
  });

  describe("PUT /:id (update)", () => {
    it("updates a book and broadcasts the change", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1, monitored: false }));
      const app = buildApp(deps);

      const res = await request(app)
        .put("/book/1")
        .send({ id: 1, foreignBookId: "fb-1", title: "Updated Title", monitored: true });

      expect(res.status).toBe(202);
      expect(deps.bookService.updateBook).toHaveBeenCalled();
      expect(res.body.monitored).toBe(true);
    });

    it("404s when the book doesn't exist", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app)
        .put("/book/999")
        .send({ id: 999, foreignBookId: "fb-x", title: "X" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a book", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      const app = buildApp(deps);

      const res = await request(app).delete("/book/1").query("deleteFiles=true");

      expect(res.status).toBe(200);
      expect(deps.bookService.deleteBook).toHaveBeenCalledWith(1, true, false);
    });

    it("rejects id <= 0", async () => {
      const deps = buildDeps();
      const app = buildApp(deps);

      const res = await request(app).delete("/book/0");

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /monitor", () => {
    it("sets monitored for multiple books", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      deps.__books.set(2, buildBook({ id: 2 }));
      const app = buildApp(deps);

      const res = await request(app)
        .put("/book/monitor")
        .send({ bookIds: [1, 2], monitored: true });

      expect(res.status).toBe(202);
      expect(deps.bookService.setMonitored).toHaveBeenCalledWith([1, 2], true);
      expect(res.body).toHaveLength(2);
    });

    it("calls setBookMonitored for a single-book request (real C# quirk, preserved)", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      const app = buildApp(deps);

      await request(app)
        .put("/book/monitor")
        .send({ bookIds: [1], monitored: false });

      expect(deps.bookService.setBookMonitored).toHaveBeenCalledWith(1, false);
    });
  });

  describe("SignalR event subscriptions", () => {
    it("broadcasts an Updated change on BookEditedEvent via the injected EventAggregator", async () => {
      const deps = buildDeps();
      deps.__books.set(1, buildBook({ id: 1 }));
      bookController(deps);

      const { BookEditedEvent } = await import("../../../../books/events.js");
      deps.eventAggregator.publishEvent(
        new BookEditedEvent(deps.__books.get(1)!, deps.__books.get(1)!)
      );

      expect(deps.signalRBroadcaster.broadcastResourceChange).toHaveBeenCalledWith(
        "Updated",
        "book",
        expect.objectContaining({ id: 1 })
      );
    });

    it("broadcasts a Deleted change on BookDeletedEvent", async () => {
      const deps = buildDeps();
      const book = buildBook({ id: 1 });
      bookController(deps);

      const { BookDeletedEvent } = await import("../../../../books/events.js");
      deps.eventAggregator.publishEvent(new BookDeletedEvent(book, false, false));

      expect(deps.signalRBroadcaster.broadcastResourceChange).toHaveBeenCalledWith(
        "Deleted",
        "book",
        expect.objectContaining({ id: 1 })
      );
    });

    it("unsubscribe() detaches all event handlers", async () => {
      const deps = buildDeps();
      const { unsubscribe } = bookController(deps);
      unsubscribe();

      const { BookDeletedEvent } = await import("../../../../books/events.js");
      deps.eventAggregator.publishEvent(new BookDeletedEvent(buildBook({ id: 1 }), false, false));

      expect(deps.signalRBroadcaster.broadcastResourceChange).not.toHaveBeenCalled();
    });
  });
});
