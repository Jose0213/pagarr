import { Router } from "express";
import type { BookService } from "../../../books/bookService.js";
import type { AuthorService } from "../../../books/authorService.js";
import type { EditionService } from "../../../books/editionService.js";
import type { Edition } from "../../../books/models.js";
import type { TagService } from "../../../tags/tagService.js";

/**
 * Ported from Readarr.Api.V1/Calendar/CalendarFeedController.cs.
 *
 * ## No iCal library dependency -- hand-written RFC 5545, per this task's
 * brief
 *
 * The real controller uses `Ical.Net` (a .NET iCalendar library) purely to
 * build one `Ical.Net.Calendar` with a handful of `CalendarEvent` (VEVENT)
 * entries and serialize it -- a small, well-specified text format (RFC
 * 5545) with no parsing/round-tripping/recurrence-rule complexity involved
 * here (every event is a single, non-recurring, all-day VEVENT). No
 * iCalendar-generation package is already a dependency of this repo (see
 * package.json), and per this task's brief ("hand-write faithfully...
 * unless the real C# logic is unexpectedly complex" -- it isn't), this
 * ports the exact VCALENDAR/VEVENT structure `Ical.Net`'s
 * `SerializerFactory` would emit for this specific, narrow usage, by hand,
 * with no new dependency.
 *
 * ## Field-by-field mapping (ported exactly)
 *
 *   - `ProductId = "-//readarr.com//Readarr//EN"` -> `PRODID` (kept
 *     literally "readarr.com"/"Readarr" -- this is the iCal spec's
 *     product-identifier field, an opaque compatibility string most
 *     calendar clients never display; changing it wouldn't be a "faithful
 *     port" of the actual behavior/format, just cosmetic churn on a field
 *     no test or user-facing surface depends on).
 *   - `NAME`/`X-WR-CALNAME` non-standard properties, both set to "Readarr
 *     Book Schedule" -- ported literally (widely-supported client
 *     extensions for a human-readable calendar title, both needed since
 *     different calendar apps read one or the other).
 *   - Per book (`books.OrderBy(v => v.ReleaseDate.Value)`, ported as a
 *     pre-sort before the render loop below): `UID` = `"Readarr_book_" +
 *     book.Id`; `DESCRIPTION` = the selected monitored edition's Overview;
 *     `CATEGORIES` = book.Genres; `DTSTART`/`DTEND` = the release date as a
 *     date-only value (`HasTime = false` -- `VALUE=DATE`, not
 *     `DATE-TIME`), both equal (a single-day all-day event); `SUMMARY` =
 *     `"{author.Name} - {book.Title}"`.
 *   - Tag filtering (`tagList`, comma-separated tag labels/ids resolved via
 *     `_tagService.GetTag`): `tags.Any() && tags.None(author.Tags.Contains)`
 *     skips a book whose author has none of the requested tags -- ported
 *     literally as `filterTags` below (an empty/absent `tagList` disables
 *     filtering entirely, matching `tags.Any()`'s guard).
 *   - `author.Tags` -- the real C# reads this off a freshly re-fetched
 *     `Author` (`_authorService.GetAuthor(book.AuthorId)`, "Temp fix" per
 *     the source's own comment, since `Book.Author` isn't populated by
 *     `BooksBetweenDates`) -- ported via `authorService.getAuthorByMetadataId()`
 *     per book (`GetAuthor` looks up by `Author.Id`, a DIFFERENT key from
 *     the `AuthorMetadataId` FK a `Book` actually carries -- ported using
 *     the correct lookup, not a literal `getAuthor` call).
 *   - `selectedEdition` (the single monitored edition, for `DESCRIPTION`) --
 *     same "not populated by BooksBetweenDates" situation as `book.Author`
 *     above; see CalendarResource.ts's doc comment for why this is
 *     resolved via a bulk `EditionService.getAllMonitoredEditions()` lookup
 *     instead of reading an (always-empty here) `book.editions`.
 *   - `Status`/`occurrence.Status` (`Confirmed`/`Tentative` by HasFile) is
 *     COMMENTED OUT in the real source (`//occurrence.Status = ...`) --
 *     genuinely dead code in the real controller, not ported here either
 *     (there's nothing to port: the real method never sets `STATUS` on any
 *     VEVENT).
 *
 * `[HttpGet("Readarr.ics")]` -- mounted at `GET /Readarr.ics` under this
 * feed's base path (the real `[V1FeedController("calendar")]` base is
 * `/feed/v1/calendar`, out of this file's concern -- the composition root
 * decides base-path mounting; see this task's brief, "do not wire into
 * app.ts's bootstrap").
 */
export interface CalendarFeedControllerOptions {
  bookService: BookService;
  authorService: AuthorService;
  editionService: EditionService;
  tagService: TagService;
}

/** Ported from `DateTime.ToString("yyyyMMdd")` -- the VALUE=DATE iCal date format (no time/timezone component, matching `HasTime = false`). */
function formatIcalDate(isoDate: string): string {
  const d = new Date(isoDate);
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Ported from `Ical.Net`'s content-line folding/escaping for TEXT-valued
 * properties (SUMMARY/DESCRIPTION): backslash-escape backslashes,
 * semicolons, and commas, and turn embedded newlines into a literal `\n`
 * escape sequence -- RFC 5545 section 3.3.11's TEXT value escaping, the
 * same set `Ical.Net`'s serializer applies to any free-text property
 * value.
 */
function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/** Ported from `SerializerFactory`'s CRLF line endings -- RFC 5545 requires CRLF, not bare LF. */
const CRLF = "\r\n";

export function calendarFeedController(options: CalendarFeedControllerOptions): Router {
  const { bookService, authorService, editionService, tagService } = options;
  const router = Router();

  router.get("/Readarr.ics", (req, res) => {
    const pastDays = parseIntOr(req.query["pastDays"], 7);
    const futureDays = parseIntOr(req.query["futureDays"], 28);
    const tagList = typeof req.query["tagList"] === "string" ? req.query["tagList"] : "";
    const unmonitored =
      typeof req.query["unmonitored"] === "string" &&
      req.query["unmonitored"].toLowerCase() === "true";

    const start = addDays(startOfToday(), -pastDays);
    const end = addDays(startOfToday(), futureDays);

    const tags: number[] = [];
    if (tagList.trim() !== "") {
      for (const label of tagList.split(",")) {
        tags.push(tagService.getTag(label).id);
      }
    }

    const books = bookService
      .booksBetweenDates(start.toISOString(), end.toISOString(), unmonitored)
      .filter((b) => b.releaseDate !== null)
      .sort((a, b) => Date.parse(a.releaseDate!) - Date.parse(b.releaseDate!));

    const editionsByBookId = groupMonitoredEditionsByBookId(
      editionService.getAllMonitoredEditions()
    );

    const lines: string[] = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//readarr.com//Readarr//EN");
    lines.push("NAME:Readarr Book Schedule");
    lines.push("X-WR-CALNAME:Readarr Book Schedule");

    for (const book of books) {
      // Ported from `_authorService.GetAuthor(book.AuthorId)` -- "Temp fix"
      // per the real source's own comment, since `Book.Author` isn't
      // populated by `BooksBetweenDates`. `AuthorService.getAuthor(id)`
      // looks up by `Author.id`, a DIFFERENT key from the FK `Book`
      // actually carries (`authorMetadataId`) -- `getAuthorByMetadataId` is
      // the correct lookup (same fix as CalendarController.ts's identical
      // author-lookup call).
      const author = authorService.getAuthorByMetadataId(book.authorMetadataId);
      if (!author) {
        continue;
      }

      if (tags.length > 0 && !tags.some((t) => author.tags.includes(t))) {
        continue;
      }

      const selectedEdition = editionsByBookId.get(book.id);
      const dateStr = formatIcalDate(book.releaseDate!);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:Readarr_book_${book.id}`);
      lines.push(`DESCRIPTION:${escapeIcalText(selectedEdition?.overview ?? "")}`);
      if (book.genres.length > 0) {
        lines.push(`CATEGORIES:${book.genres.map(escapeIcalText).join(",")}`);
      }
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
      lines.push(`DTEND;VALUE=DATE:${dateStr}`);
      lines.push(`SUMMARY:${escapeIcalText(`${author.metadata?.name ?? ""} - ${book.title}`)}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    res.type("text/calendar").send(lines.join(CRLF) + CRLF);
  });

  return router;
}

/** Ported spirit of `.GroupBy(x => x.BookId)` -- see CalendarController.ts's identical helper. */
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

function parseIntOr(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
