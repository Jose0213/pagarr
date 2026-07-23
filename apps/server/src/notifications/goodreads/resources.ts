/**
 * FORWARD-REF STAND-IN for the subset of `NzbDrone.Core/MetadataSource/
 * Goodreads/Resources/*.cs` that `GoodreadsBookshelf.cs` actually reads
 * (`UserShelfResource.Name`, `ReviewResource.Book` (a `BookSummaryResource`),
 * `BookSummaryResource.{Id,WorkId}`, and the `PaginatedList<T>`/
 * `PaginationModel` XML-pagination envelope). That MetadataSource.Goodreads
 * *client* module itself was already evaluated as dead in an earlier phase
 * (see `docs/known-issues-fixlist.md` #1) and has not been ported -- this
 * worktree only needs these few fields to make `GoodreadsBookshelf.ts`
 * compile and behave faithfully, not the full ~15-resource metadata tree
 * (AuthorResource, WorkResource, BookLinkResource, etc. are all out of
 * scope here). At merge-time reconciliation, if a future phase ports
 * MetadataSource/Goodreads for real, these narrow stand-ins should be
 * deleted and `goodreads/GoodreadsBookshelf.ts` re-pointed at the real
 * resource types instead.
 *
 * XML parsing uses this port's real, already-ported `XElement` adapter
 * (`indexers/xml/XElement.ts`, built on `fast-xml-parser`) as the
 * `System.Xml.Linq.XElement` substitute -- not a new dependency.
 */
import { XElement } from "../../indexers/xml/XElement.js";

export interface BookSummaryResource {
  id: number;
  workId: number | null;
}

/** Ported from BookSummaryResource.Parse (only the two fields this worktree's Bookshelf notifier reads). */
export function parseBookSummaryResource(element: XElement): BookSummaryResource {
  const id = Number(element.element("id")?.value ?? "0");
  const workElement = element.element("work");
  const workIdRaw = workElement?.element("id")?.value;
  const workId = workIdRaw !== undefined && workIdRaw !== "" ? Number(workIdRaw) : null;

  return { id, workId };
}

export interface ReviewResource {
  id: number;
  book: BookSummaryResource | null;
}

/** Ported from ReviewResource.Parse (only the fields this worktree's Bookshelf notifier reads). */
export function parseReviewResource(element: XElement): ReviewResource {
  const id = Number(element.element("id")?.value ?? "0");
  const bookElement = element.element("book");
  const book = bookElement ? parseBookSummaryResource(bookElement) : null;

  return { id, book };
}

export interface UserShelfResource {
  id: number;
  name: string;
}

/** Ported from UserShelfResource.Parse (only the fields this worktree's Bookshelf notifier reads). */
export function parseUserShelfResource(element: XElement): UserShelfResource {
  const id = Number(element.element("id")?.value ?? "0");
  const name = element.element("name")?.value ?? "";

  return { id, name };
}

export interface PaginationModel {
  start: number;
  end: number;
  totalItems: number;
}

/**
 * Ported from PaginationModel.Parse -- the non-search branch only (neither
 * of Bookshelf.cs's two paginated calls, `shelf/list.xml`/`review/list.xml`,
 * hits Goodreads' `search` endpoint, so the `element.Name == "search"`
 * branch is out of scope here).
 */
export function parsePaginationModel(element: XElement): PaginationModel {
  const start = Number(element.attribute("start") ?? "0");
  const end = Number(element.attribute("end") ?? "0");
  const totalItems = Number(element.attribute("total") ?? "0");

  return {
    start: Number.isNaN(start) ? 0 : start,
    end: Number.isNaN(end) ? 0 : end,
    totalItems: Number.isNaN(totalItems) ? 0 : totalItems,
  };
}

export interface PaginatedList<T> {
  list: T[];
  pagination: PaginationModel;
}

/**
 * Ported from PaginatedList<T>.Parse (non-search branch -- see
 * `parsePaginationModel`'s doc comment). `element.ParseChildren<T>()` in
 * the C# collects every direct child element and parses each as `T`;
 * reproduced here via `element.elements()` + the supplied per-item parser.
 */
export function parsePaginatedList<T>(
  element: XElement,
  parseItem: (el: XElement) => T
): PaginatedList<T> {
  const pagination = parsePaginationModel(element);
  const list = element.elements().map(parseItem);

  return { list, pagination };
}

/**
 * Ported from `NzbDrone.Core/Notifications/Goodreads/GoodreadsNotificationBase.cs`'s
 * private `AuthorizationHeader` DTO (deserialization target for the
 * Servarr-operated OAuth-signing proxy response) -- inlined as a private
 * class in the C# file rather than its own resource, kept here alongside
 * the other Goodreads XML/JSON DTOs for this worktree.
 */
export interface AuthorizationHeader {
  authorization: string;
}
