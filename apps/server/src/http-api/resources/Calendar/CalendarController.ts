import { Router } from "express";
import { stripDefaultId } from "../../rest/RestResource.js";
import type { BookService } from "../../../books/bookService.js";
import type { AuthorService } from "../../../books/authorService.js";
import type { EditionService } from "../../../books/editionService.js";
import type { Edition } from "../../../books/models.js";
import { bookToCalendarResource } from "./CalendarResource.js";

/**
 * Ported from Readarr.Api.V1/Calendar/CalendarController.cs.
 *
 * `CalendarController` extends `BookControllerWithSignalR` in the real C#
 * source (giving it every base REST route for free -- GET/:id, POST, PUT,
 * DELETE, all operating on `BookResource`) on top of its own `[HttpGet]
 * GetCalendar` action; per this task's brief, this port only needs
 * `GetCalendar` itself (the calendar-specific behavior) -- see
 * CalendarResource.ts's doc comment for why the base `BookController`
 * REST-CRUD routes aren't duplicated here (that's the `Books/` API
 * group's own scope, a different worktree).
 *
 * `includeBookImages` (`Request.GetBooleanQueryParameter("includeBookImages")`,
 * a boolean query param this port has no shared helper for yet) is read
 * but never actually used anywhere in the real method body beyond that one
 * assignment -- `//TODO: Add Book Image support to BookControllerWithSignalR`
 * is a literal comment in the real source marking it as dead/unfinished
 * plumbing. Preserved faithfully: parsed the same way (best-effort boolean
 * query param), never referenced afterward.
 */
export interface CalendarControllerOptions {
  bookService: BookService;
  authorService: AuthorService;
  editionService: EditionService;
}

/** Ported from `Request.GetBooleanQueryParameter(name)` -- narrowed to this one call site's need (no shared port of that extension method exists yet). */
function booleanQueryParameter(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "true";
}

export function calendarController(options: CalendarControllerOptions): Router {
  const { bookService, authorService, editionService } = options;
  const router = Router();

  router.get("/", (req, res) => {
    const { start, end, unmonitored, includeAuthor } = req.query;

    // Kept per module doc comment -- read, never used further. See there.
    booleanQueryParameter(req.query["includeBookImages"]);

    const startUse = typeof start === "string" && start ? new Date(start) : startOfToday();
    const endUse = typeof end === "string" && end ? new Date(end) : addDays(startOfToday(), 2);
    const includeUnmonitored = booleanQueryParameter(unmonitored);
    const includeAuthorResource = booleanQueryParameter(includeAuthor);

    const books = bookService.booksBetweenDates(
      startUse.toISOString(),
      endUse.toISOString(),
      includeUnmonitored
    );

    // Ported spirit of `BookController.GetBooks`'s own bulk edition-join
    // pattern -- see CalendarResource.ts's doc comment for why
    // `book.editions` itself isn't populated by `booksBetweenDates`.
    const editionsByBookId = groupMonitoredEditionsByBookId(
      editionService.getAllMonitoredEditions()
    );

    const resources = books.map((book) => {
      // Ported spirit of CalendarFeedController's own "Temp fix" comment
      // (`_authorService.GetAuthor(book.AuthorId)`, since `Book.Author` isn't
      // populated by `BooksBetweenDates`) -- this port's `booksBetweenDates`
      // likewise leaves `book.author` unset, so the author is looked up
      // explicitly by `authorMetadataId` (the FK `Book` actually carries;
      // `AuthorService.getAuthor(id)` looks up by `Author.id`, a DIFFERENT
      // key -- `getAuthorByMetadataId` is the correct lookup here).
      const author = includeAuthorResource
        ? authorService.getAuthorByMetadataId(book.authorMetadataId)
        : undefined;
      const selectedEdition = editionsByBookId.get(book.id);
      return stripDefaultId(
        bookToCalendarResource(book, selectedEdition, author, includeAuthorResource)
      );
    });

    resources.sort((a, b) => {
      const aTime = "releaseDate" in a && a.releaseDate ? Date.parse(a.releaseDate) : 0;
      const bTime = "releaseDate" in b && b.releaseDate ? Date.parse(b.releaseDate) : 0;
      return aTime - bTime;
    });

    res.json(resources);
  });

  return router;
}

/** Ported spirit of `.GroupBy(x => x.BookId)` -- one monitored edition per book id (matches `selectedEdition`'s "the single monitored edition" assumption every mapper here relies on; a book with more than one monitored edition is a data anomaly this port doesn't need to arbitrate any differently than the real C#'s `SingleOrDefault` would). */
function groupMonitoredEditionsByBookId(editions: Edition[]): Map<number, Edition> {
  const map = new Map<number, Edition>();
  for (const edition of editions) {
    map.set(edition.bookId, edition);
  }
  return map;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
