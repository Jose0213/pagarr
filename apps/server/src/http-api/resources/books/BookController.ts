import { Router } from "express";
import type { AuthorService } from "../../../books/authorService.js";
import type { BookService } from "../../../books/bookService.js";
import { BookDeletedEvent, BookEditedEvent, BookUpdatedEvent } from "../../../books/events.js";
import type { EditionService } from "../../../books/editionService.js";
import type { SeriesBookLinkService } from "../../../books/seriesBookLinkService.js";
import type { Author, Book, Edition } from "../../../books/models.js";
import type { IAuthorStatisticsService } from "../../../author-stats/authorStatisticsService.js";
import type { IMapCoversToLocal } from "../../../media-cover/mediaCoverService.js";
import { MediaCoverEntity } from "../../../media-cover/mediaCover.js";
import type { IUpgradableSpecification } from "../../../decision-engine/specifications/upgradableSpecification.js";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import { ModelAction } from "../../../db/events.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import type { RestControllerOptions } from "../../rest/RestController.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { isValidFolderPath } from "../../../validation/paths/pathValidation.js";
import {
  isValidMetadataProfileId,
  isValidQualityProfileId,
} from "../../../validation/entityExistsValidators.js";
import type { IdExistenceCheck } from "../../../validation/entityExistsValidators.js";
import { BookGrabbedEvent } from "../../../download-tracking/bookGrabbedEvent.js";
import { BookImportedEvent } from "../../../health-check/checks/bookImportedEvent.js";
import { TrackImportedEvent, BookFileDeletedEvent } from "../../../media-files-import/events.js";
import { DeleteMediaFileReason } from "../../../media-files-import/deleteMediaFileReason.js";
import type { LocalBook } from "../../../parser/model/localBook.js";
import type { BookResource } from "./BookResource.js";
import {
  authorToResource,
  bookResourceToModel,
  bookResourceToModelMerge,
  bookToResource,
  booksToResource,
} from "./BookResource.js";
import { bookStatisticsToResource } from "./BookStatisticsResource.js";
import type { BooksMonitoredResource } from "./BooksMonitoredResource.js";

/**
 * Ported from Readarr.Api.V1.Books/{BookController,BookControllerWithSignalR}.cs.
 *
 * ## Forward-ref: `IAddBookService`
 *
 * `AddBookService`/`IAddBookService` (NzbDrone.Core/Books/Services/
 * AddBookService.cs) has not landed in any merged module as of this
 * worktree -- `books/index.ts`'s barrel confirms no such export exists (see
 * this file's own module search). `BookController.AddBook`'s real C# body
 * is a single line, `_addBookService.AddBook(bookResource.ToModel())` --
 * narrowed to that one method here, matching this port's established
 * "forward-ref the narrow slice, shape copied 1:1 from the real C#
 * interface" convention (see decision-engine/remoteBook.ts's doc comment
 * for the canonical statement of this pattern). When AddBookService lands,
 * swap the import for the real module -- this interface's single method
 * signature already matches it exactly.
 *
 * ## SignalR wiring -- two independent broadcast paths, both faithfully wired
 *
 * `RestControllerWithSignalR<BookResource, Book>`'s real C# base
 * additionally implements `IHandle<ModelEvent<Book>>` generically (every
 * subclass gets it via the DI container's reflection scan -- see
 * `RestControllerWithSignalR.ts`'s own doc comment) -- `restControllerWithSignalR()`
 * below wires that subscription automatically. In practice this path never
 * fires for real Book/Edition writes: `BookRepository`/`EditionRepository`
 * (already-ported `books/bookRepository.ts`/`editionRepository.ts`) never
 * override `BasicRepository`'s `protected virtual bool PublishModelEvents
 * => false` default, so no `ModelEvent<Book>` is ever actually published --
 * confirmed by reading both repository files directly, matching the real
 * C# source's identical default-false override state. This is a real,
 * faithfully-preserved quirk of the original app (the base class's generic
 * subscription is "live" but structurally dead for this resource), not a
 * bug introduced by this port.
 *
 * The SEVEN explicit `IHandle<T>` implementations on `BookController`
 * itself (`BookGrabbedEvent`, `BookEditedEvent`, `BookUpdatedEvent`,
 * `BookDeletedEvent`, `BookImportedEvent`, `TrackImportedEvent`,
 * `BookFileDeletedEvent`) are the real broadcast path for Book resource
 * changes -- these are wired below via direct `eventAggregator.subscribe()`
 * calls against the real, already-merged `messaging/events/eventAggregator.ts`
 * `EventAggregator` (NOT `books/events.ts`'s narrower `IBooksEventAggregator`
 * -- see that file's own doc comment on why Books services publish through
 * their own domain-event aggregator rather than the real one). Callers
 * wiring up this controller for real must therefore pass the SAME
 * `EventAggregator` instance both to this function AND to whatever
 * publishes `BookEditedEvent`/`BookDeletedEvent`/etc -- today, per
 * `books/bookService.ts`'s own constructor, that's a `IBooksEventAggregator`
 * implementation, which is a DIFFERENT object than `messaging/events/
 * eventAggregator.ts`'s `EventAggregator` unless a caller's composition
 * root explicitly bridges the two (e.g. an `IBooksEventAggregator`
 * implementation whose `publishEvent` forwards to a real `EventAggregator.
 * publishEvent`). That bridging is a composition-root wiring concern (this
 * task's brief: "export routers, do NOT wire into app.ts") -- documented
 * here so whoever performs that wiring knows both aggregators must be
 * connected for these SignalR broadcasts to ever fire for real book
 * mutations, exactly mirroring the real C# app's single DI-container-wide
 * `IEventAggregator` (there is only ever one, there specifically because
 * .NET's container wires every `IHandle<T>` against the SAME instance --
 * this port's two-aggregator split is the one deliberate structural
 * deviation from that, per `books/events.ts`'s own documented rationale,
 * and this is the seam where it becomes externally visible).
 */

export interface IAddBookService {
  addBook(book: Book): Book;
}

export interface BookControllerDeps {
  authorService: Pick<AuthorService, "getAuthor" | "getAllAuthors" | "getAuthorByMetadataId">;
  bookService: BookService;
  addBookService: IAddBookService;
  editionService: Pick<
    EditionService,
    "getAllMonitoredEditions" | "getEditionsByAuthor" | "getEditionsByBook" | "updateMany"
  >;
  seriesBookLinkService: Pick<SeriesBookLinkService, "getLinksByBook">;
  authorStatisticsService: IAuthorStatisticsService;
  coverMapper: Pick<IMapCoversToLocal, "convertToLocalUrls">;
  /**
   * Ported from the real ctor param `_qualityUpgradableSpecification`.
   * Confirmed by reading both `BookController.cs` and
   * `BookControllerWithSignalR.cs` directly: the field is assigned in the
   * base ctor and NEVER read anywhere else in either file -- a genuinely
   * unused constructor dependency in the real, shipped C# source. Accepted
   * here (not omitted) purely for constructor-shape fidelity with real DI
   * wiring; never called.
   */
  upgradableSpecification?: IUpgradableSpecification;
  qualityProfileExistsValidator: IdExistenceCheck;
  metadataProfileExistsValidator: IdExistenceCheck;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
}

function mapBookToResource(
  deps: Pick<BookControllerDeps, "authorStatisticsService" | "coverMapper">,
  book: Book,
  includeAuthor: boolean
): BookResource {
  const resource = bookToResource(book)!;

  if (includeAuthor && book.author) {
    resource.author = authorToResource(book.author);
  }

  const stats = deps.authorStatisticsService.authorStatisticsByAuthor(resource.authorId);
  const bookStats = stats.bookStatistics?.find((s) => s.bookId === resource.id);
  resource.statistics = bookStats ? bookStatisticsToResource(bookStats) : undefined;

  deps.coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Book, resource.images);

  return resource;
}

function mapBooksToResource(
  deps: Pick<
    BookControllerDeps,
    "seriesBookLinkService" | "authorStatisticsService" | "coverMapper"
  >,
  books: Book[],
  includeAuthor: boolean
): BookResource[] {
  const seriesLinks = deps.seriesBookLinkService.getLinksByBook(books.map((b) => b.id));
  const linksByBook = new Map<number, typeof seriesLinks>();
  for (const link of seriesLinks) {
    const list = linksByBook.get(link.bookId) ?? [];
    list.push(link);
    linksByBook.set(link.bookId, list);
  }

  for (const book of books) {
    book.seriesLinks = linksByBook.get(book.id) ?? [];
  }

  const result = booksToResource(books);

  if (includeAuthor) {
    const authorDict = new Map<number, Author>();
    for (let i = 0; i < books.length; i++) {
      const book = books[i]!;
      const resource = result[i]!;
      const author = authorDict.get(book.authorMetadataId) ?? book.author;
      if (author) {
        authorDict.set(author.authorMetadataId, author);
        resource.author = authorToResource(author);
      }
    }
  }

  const authorStats = deps.authorStatisticsService.authorStatistics();
  const bookStatsDict = new Map<number, ReturnType<typeof bookStatisticsToResource>>();
  for (const stat of authorStats) {
    for (const bookStat of stat.bookStatistics) {
      bookStatsDict.set(bookStat.bookId, bookStatisticsToResource(bookStat));
    }
  }
  for (const resource of result) {
    const stats = bookStatsDict.get(resource.id);
    if (stats) {
      resource.statistics = stats;
    }
  }

  for (const resource of result) {
    deps.coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Book, resource.images);
  }

  return result;
}

/** Ported from BookController's PostValidator rules (registered in its ctor, on top of the base's). */
function buildPostValidator(deps: BookControllerDeps): ResourceValidator<BookResource> {
  return (resource) => {
    const failures: ReturnType<ResourceValidator<BookResource>> = [];

    if (!resource.foreignBookId || resource.foreignBookId.trim() === "") {
      failures.push({
        propertyName: "foreignBookId",
        errorMessage: "'Foreign Book Id' must not be empty.",
      });
    }

    const author = resource.author;
    if (!isValidQualityProfileId(deps.qualityProfileExistsValidator, author?.qualityProfileId)) {
      failures.push({
        propertyName: "author.qualityProfileId",
        errorMessage: "Quality Profile does not exist",
      });
    }

    if (!isValidMetadataProfileId(deps.metadataProfileExistsValidator, author?.metadataProfileId)) {
      failures.push({
        propertyName: "author.metadataProfileId",
        errorMessage: "Metadata Profile does not exist",
      });
    }

    // Ported: `.When(s => s.Author.Path.IsNullOrWhiteSpace())` -- RootFolderPath
    // is only required to be a valid path when Author.Path is blank/unset.
    const authorPath = author?.path;
    if (!authorPath || authorPath.trim() === "") {
      if (!isValidFolderPath(author?.rootFolderPath)) {
        failures.push({
          propertyName: "author.rootFolderPath",
          errorMessage: "Root folder path is not valid",
        });
      }
    }

    if (!author?.foreignAuthorId || author.foreignAuthorId.trim() === "") {
      failures.push({
        propertyName: "author.foreignAuthorId",
        errorMessage: "'Foreign Author Id' must not be empty.",
      });
    }

    return failures;
  };
}

/**
 * Builds the `book` SignalR resource-broadcast + REST router. Returns the
 * Express `Router` (mount at `/api/v1/book`, matching `[V1ApiController]`'s
 * default resource-name-from-class convention -- `BookController` ->
 * "book") plus an `unsubscribe`/`unsubscribeAll` pair for test teardown.
 * NOT mounted into any app here -- see this worktree's task brief.
 */
export function bookController(deps: BookControllerDeps): {
  router: Router;
  unsubscribe: () => void;
} {
  const postValidator = buildPostValidator(deps);

  function getResourceById(id: number, includeAuthor: boolean): BookResource {
    const book = deps.bookService.getBook(id);

    // Ported: `GetResourceById`'s real C# body is just `_bookService.
    // GetBook(id)` then `MapToResource(book, true)`, reading `book.Author.
    // Value` -- the real SqlBuilder-backed `BookRepository.Get` eager-loads
    // that relation via a join. This port's `bookRepository.get()` is a
    // plain single-table row lookup (see that file's module doc comment on
    // dropping LazyLoaded auto-population), so `.author` is populated
    // explicitly here when the caller wants it embedded, mirroring the
    // same explicit population this controller already does in its `getAll`/
    // authorId-filter branches.
    if (includeAuthor && !book.author) {
      book.author = deps.authorService.getAuthorByMetadataId(book.authorMetadataId);
    }

    return mapBookToResource(deps, book, includeAuthor);
  }

  const options: RestControllerOptions<BookResource> = {
    // Ported from `BookController.GetBooks(int? authorId, List<int> bookIds,
    // string titleSlug, bool includeAllAuthorBooks = false)` -- four
    // mutually-exclusive branches in the exact real precedence order: no
    // filters at all (every book, author+editions batch-attached) ->
    // authorId -> titleSlug (optionally widened to the whole author via
    // includeAllAuthorBooks) -> bookIds (the fallback default, reached even
    // with an empty bookIds query producing an empty result, matching the
    // real C#'s unconditional final `return MapToResource(_bookService.
    // GetBooks(bookIds), false)`).
    getAll: (req) => {
      const authorId = parseOptionalIntQuery(req.query["authorId"]);
      const bookIds = parseIntArrayQuery(req.query["bookIds"]);
      const titleSlug = parseStringQuery(req.query["titleSlug"]);
      const includeAllAuthorBooks = parseBooleanQuery(req.query["includeAllAuthorBooks"]);

      if (authorId === undefined && bookIds.length === 0 && !titleSlug) {
        const editions = deps.editionService.getAllMonitoredEditions();
        const editionsByBook = new Map<number, Edition[]>();
        for (const edition of editions) {
          const list = editionsByBook.get(edition.bookId) ?? [];
          list.push(edition);
          editionsByBook.set(edition.bookId, list);
        }

        const authors = deps.authorService.getAllAuthors();
        const authorsByMetadataId = new Map<number, Author>();
        for (const author of authors) {
          authorsByMetadataId.set(author.authorMetadataId, author);
        }

        const allBooks = deps.bookService.getAllBooks();
        for (const book of allBooks) {
          book.author = authorsByMetadataId.get(book.authorMetadataId);
          book.editions = editionsByBook.get(book.id) ?? [];
        }

        return mapBooksToResource(deps, allBooks, false);
      }

      if (authorId !== undefined) {
        const books = deps.bookService.getBooksByAuthor(authorId);
        const author = deps.authorService.getAuthor(authorId);
        const editions = deps.editionService.getEditionsByAuthor(authorId);
        const editionsByBook = new Map<number, Edition[]>();
        for (const edition of editions) {
          const list = editionsByBook.get(edition.bookId) ?? [];
          list.push(edition);
          editionsByBook.set(edition.bookId, list);
        }

        for (const book of books) {
          book.author = author;
          book.editions = editionsByBook.get(book.id) ?? [];
        }

        return mapBooksToResource(deps, books, false);
      }

      if (titleSlug) {
        const book = deps.bookService.findBySlug(titleSlug);

        if (!book) {
          return mapBooksToResource(deps, [], false);
        }

        if (includeAllAuthorBooks) {
          // Ported: `_bookService.GetBooksByAuthor(book.AuthorId)` --
          // `Book.AuthorId` is the real C#'s lazy-loaded `Author?.Value?.Id
          // ?? 0` compat getter; this port's `findBySlug` doesn't populate
          // `.author` on its result (a plain row lookup, no join), so the
          // author is resolved explicitly via its metadata id instead.
          const author = deps.authorService.getAuthorByMetadataId(book.authorMetadataId);
          const authorId = author?.id ?? 0;
          return mapBooksToResource(deps, deps.bookService.getBooksByAuthor(authorId), false);
        }

        return mapBooksToResource(deps, [book], false);
      }

      return mapBooksToResource(deps, deps.bookService.getBooks(bookIds), false);
    },
    getById: (id) => getResourceById(id, true),
    create: (resource) => {
      const model = bookResourceToModel(resource);
      const created = deps.addBookService.addBook(model);
      // Ported: `Created(book.Id)` -- restController()'s own `create` wiring
      // re-fetches via `getById`-equivalent and applies the 201 status +
      // stripDefaultId; returning the mapped resource here (rather than
      // writing the response by hand) lets that shared wrapper own both,
      // matching RestController.ts's documented `Created`/`Accepted` contract.
      return getResourceById(created.id, true);
    },
    update: (resource) => {
      const existing = deps.bookService.getBook(resource.id);
      const model = bookResourceToModelMerge(resource, existing);

      const updated = deps.bookService.updateBook(model);
      deps.editionService.updateMany(model.editions ?? []);

      deps.signalRBroadcaster.broadcastResourceChange(
        ModelAction.Updated,
        "book",
        getResourceById(updated.id, true)
      );

      return getResourceById(updated.id, true);
    },
    delete: (id, req) => {
      const deleteFiles = parseBooleanQuery(req.query["deleteFiles"]);
      const addImportListExclusion = parseBooleanQuery(req.query["addImportListExclusion"]);
      deps.bookService.deleteBook(id, deleteFiles, addImportListExclusion);
    },
    postValidator,
  };

  const { router: restRouter, unsubscribe: unsubscribeSignalR } = restControllerWithSignalR<
    BookResource,
    Book
  >({
    ...options,
    resourceName: "book",
    eventAggregator: deps.eventAggregator,
    signalRBroadcaster: deps.signalRBroadcaster,
    getResourceByIdForBroadcast: (id) => getResourceById(id, false),
  });

  // Ported precedent from ProviderControllerBase.ts: specific static/nested
  // paths ("monitor", ":id/overview") are registered on their OWN outer
  // router BEFORE the generic restController()-built CRUD router is
  // mounted underneath -- otherwise `restController`'s `PUT /:id?` would
  // greedily match `PUT /monitor` first (Express matches route
  // registration order, and `/:id?` matches any single path segment
  // including the literal string "monitor"). See that file's own doc
  // comment for the identical ordering constraint on `/schema`/`/bulk`/etc.
  const router = Router();

  // ---- `[HttpGet("{id:int}/overview")]` -----------------------------------
  router.get("/:id/overview", (req, res) => {
    const id = Number.parseInt(req.params["id"] ?? "", 10);
    const editions = deps.editionService.getEditionsByBook(id);
    const monitoredEdition = editions.find((e) => e.monitored);
    if (!monitoredEdition) {
      throw new Error("Sequence contains no matching element");
    }
    res.json({ id, overview: monitoredEdition.overview });
  });

  // ---- `[HttpPut("monitor")]` ----------------------------------------------
  router.put("/monitor", (req, res) => {
    const resource = req.body as BooksMonitoredResource;

    deps.bookService.setMonitored(resource.bookIds, resource.monitored);
    if (resource.bookIds.length === 1) {
      deps.bookService.setBookMonitored(resource.bookIds[0]!, resource.monitored);
    } else {
      deps.bookService.setMonitored(resource.bookIds, resource.monitored);
    }

    const books = deps.bookService.getBooks(resource.bookIds);
    res.status(202).json(mapBooksToResource(deps, books, false).map(stripDefaultId));
  });

  router.use("/", restRouter);

  // ---- Explicit IHandle<T> subscriptions (see module doc comment) --------
  const unsubBookGrabbed = deps.eventAggregator.subscribe(BookGrabbedEvent, {
    handle: (message: BookGrabbedEvent) => {
      for (const book of message.book.books) {
        const resource = bookToResource(book)!;
        resource.grabbed = true;
        deps.signalRBroadcaster.broadcastResourceChange(ModelAction.Updated, "book", resource);
      }
    },
  });

  const unsubBookEdited = deps.eventAggregator.subscribe(BookEditedEvent, {
    handle: (message: BookEditedEvent) => {
      deps.signalRBroadcaster.broadcastResourceChange(
        ModelAction.Updated,
        "book",
        mapBookToResource(deps, message.book, true)
      );
    },
  });

  const unsubBookUpdated = deps.eventAggregator.subscribe(BookUpdatedEvent, {
    handle: (message: BookUpdatedEvent) => {
      deps.signalRBroadcaster.broadcastResourceChange(
        ModelAction.Updated,
        "book",
        mapBookToResource(deps, message.book, true)
      );
    },
  });

  const unsubBookDeleted = deps.eventAggregator.subscribe(BookDeletedEvent, {
    handle: (message: BookDeletedEvent) => {
      const resource = bookToResource(message.book)!;
      deps.signalRBroadcaster.broadcastResourceChange(ModelAction.Deleted, "book", resource);
    },
  });

  const unsubBookImported = deps.eventAggregator.subscribe(BookImportedEvent, {
    handle: (message: BookImportedEvent) => {
      deps.signalRBroadcaster.broadcastResourceChange(
        ModelAction.Updated,
        "book",
        mapBookToResource(deps, message.book, true)
      );
    },
  });

  const unsubTrackImported = deps.eventAggregator.subscribe(TrackImportedEvent, {
    handle: (message: TrackImportedEvent<LocalBook>) => {
      const book = message.trackInfo.book;
      if (book) {
        deps.signalRBroadcaster.broadcastResourceChange(
          ModelAction.Updated,
          "book",
          bookToResource(book)!
        );
      }
    },
  });

  const unsubBookFileDeleted = deps.eventAggregator.subscribe(BookFileDeletedEvent, {
    handle: (message: BookFileDeletedEvent) => {
      if (message.reason === DeleteMediaFileReason.Upgrade) {
        return;
      }

      const book = message.bookFile.edition?.book;
      if (book) {
        deps.signalRBroadcaster.broadcastResourceChange(
          ModelAction.Updated,
          "book",
          mapBookToResource(deps, book, true)
        );
      }
    },
  });

  function unsubscribe(): void {
    unsubscribeSignalR();
    unsubBookGrabbed();
    unsubBookEdited();
    unsubBookUpdated();
    unsubBookDeleted();
    unsubBookImported();
    unsubTrackImported();
    unsubBookFileDeleted();
  }

  return { router, unsubscribe };
}

/** Ported from ASP.NET model binding's `bool` query-param coercion (`[FromQuery]bool includeAllAuthorBooks = false` etc.) -- Express gives every query value as a string (or string[]/undefined), so this maps the wire representation back to a real boolean, defaulting false for anything else, matching the C# default parameter value. */
function parseBooleanQuery(value: unknown): boolean {
  return value === "true" || value === true;
}

/** Ported from `[FromQuery]int? authorId` binding: absent/unparseable -> undefined (no filter), matching ASP.NET's nullable-int model binding leaving the parameter null when the query string is missing. */
function parseOptionalIntQuery(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Ported from `[FromQuery]string titleSlug` binding, `.IsNullOrWhiteSpace()`-style blank normalization to `undefined`. */
function parseStringQuery(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value;
}

/** Ported from `[FromQuery]List<int> bookIds` binding: ASP.NET accepts repeated `?bookIds=1&bookIds=2` query keys, which Express's default query parser (`qs`) surfaces as a real array under the same key; a single occurrence arrives as a bare string instead, so both shapes are normalized to a number array here. */
function parseIntArrayQuery(value: unknown): number[] {
  if (value === undefined) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));
}
