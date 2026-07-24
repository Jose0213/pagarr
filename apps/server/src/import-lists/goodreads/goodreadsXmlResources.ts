/**
 * Minimal, self-contained XML parsing for the specific Goodreads API
 * response shapes `ImportLists/Goodreads/{Bookshelf,OwnedBooks}` actually
 * read (review/list.xml, shelf/list.xml, owned_books/user).
 *
 * SCOPING NOTE: the real C# providers deserialize these via
 * `httpResponse.Deserialize<PaginatedList<T>>("root")`
 * (`MetadataSource/Goodreads/Extensions/HttpResponseExtensions.cs`), which
 * pulls in `NzbDrone.Core.MetadataSource.Goodreads`'s full `GoodreadsResource`
 * / `BookSummaryResource` / `AuthorSummaryResource` / `PaginatedList<T>`
 * XML-DTO framework (`MetadataSource/Goodreads/Resources/*.cs`). That
 * framework belongs to the ALREADY-excluded dead MetadataSource Goodreads
 * *read* client (`docs/known-issues-fixlist.md` #1, confirmed again by
 * `metadata-source/interfaces.ts`'s own scoping doc comment) -- it was never
 * ported, on purpose, and rebuilding the entire generic reflection-driven
 * resource/pagination framework here (for an API that's been closed to new
 * keys since December 2020) would be disproportionate to what ImportLists'
 * own three concrete Goodreads providers actually need.
 *
 * `deserializeGoodreadsResponse` below IS a faithful, behavior-preserving
 * port of `HttpResponseExtensions.Deserialize<T>` + its `ThrowIfException`
 * helper -- both control-flow paths that matter to this module's callers
 * (return `null` on malformed/errorless-but-rootless XML; throw a
 * `GoodreadsException` carrying the parsed Goodreads error message on any
 * of the four real error response shapes; otherwise XPath-select the named
 * child of `<GoodreadsResponse>` and hand it to the caller's own item
 * parser). What's NOT reconstructed is the reflection-driven `T : new()` /
 * `ElementName` / `ParseChildren<T>()` machinery itself -- callers pass
 * their own narrow per-item parse function instead (see `parseReview`/
 * `parseUserShelf`/`parseOwnedBook` below), which is the direct substitute
 * for `PaginatedList<T>.Parse`'s `element.ParseChildren<T>()` call. Field
 * names (`id`, `title_without_series`, `authors`/`author`, `name`) match the
 * real Goodreads XML schema the C# `Parse(XElement)` methods read from.
 */

import { XElement } from "../../indexers/xml/XElement.js";
import { GoodreadsException } from "./GoodreadsException.js";

export interface GoodreadsAuthorSummary {
  id: string;
  name: string;
}

export interface GoodreadsBookSummary {
  id: string;
  titleWithoutSeries: string;
  authors: GoodreadsAuthorSummary[];
}

export interface GoodreadsReview {
  book: GoodreadsBookSummary | null;
}

export interface GoodreadsUserShelf {
  name: string;
}

export interface GoodreadsOwnedBook {
  book: GoodreadsBookSummary | null;
}

/** Ported from `AuthorSummaryResource.Parse(XElement)`'s field set actually consumed downstream (Id, Name). */
function parseAuthorSummary(element: XElement): GoodreadsAuthorSummary {
  return {
    id: element.element("id")?.value ?? "",
    name: element.element("name")?.value ?? "",
  };
}

/** Ported from `BookSummaryResource.Parse(XElement)`'s field set actually consumed downstream (Id, TitleWithoutSeries, Authors). */
function parseBookSummary(element: XElement): GoodreadsBookSummary {
  const authorsElement = element.element("authors");
  const authors = authorsElement ? authorsElement.elements("author").map(parseAuthorSummary) : [];

  return {
    id: element.element("id")?.value ?? "",
    titleWithoutSeries: element.element("title_without_series")?.value ?? "",
    authors,
  };
}

/** Ported from `ReviewResource.Parse(XElement)`'s field set actually consumed downstream (Book). Item tag: "review". */
export function parseReview(element: XElement): GoodreadsReview {
  const bookElement = element.element("book");
  return { book: bookElement ? parseBookSummary(bookElement) : null };
}

/** Ported from `UserShelfResource.Parse(XElement)`'s field set actually consumed downstream (Name). Item tag: "shelf". */
export function parseUserShelf(element: XElement): GoodreadsUserShelf {
  return { name: element.element("name")?.value ?? "" };
}

/** Ported from `OwnedBookResource.Parse(XElement)`'s field set actually consumed downstream (Book). Item tag: "owned_book". */
export function parseOwnedBook(element: XElement): GoodreadsOwnedBook {
  const bookElement = element.element("book");
  return { book: bookElement ? parseBookSummary(bookElement) : null };
}

/**
 * Ported from `HttpResponseExtensions.ThrowIfException(HttpResponse)`: scans
 * a parsed `<GoodreadsResponse>`-rooted (or bare) document for any of the
 * four Goodreads error response shapes (bare `<error>`, `<errors><error>...
 * </errors>`, `<hash>` with status/error children, or
 * `GoodreadsResponse/error` with generic/detail/friendly sub-messages,
 * preferring friendly > detail > generic > plain text) and throws
 * `GoodreadsException` with the extracted message if found. A malformed
 * document is swallowed here exactly like the C#'s `catch (XmlException) {
 * }` -- "we don't really care, we're just trying to find an error message."
 */
function throwIfGoodreadsError(content: string): void {
  let root: XElement;
  try {
    root = XElement.parse(content);
  } catch {
    return;
  }

  let error: string | null = null;

  if (root.name === "error") {
    error = root.value;
  } else if (root.name === "errors") {
    const children = root.descendants("error");
    if (children.length > 0) {
      error = children.map((c) => c.value).join("\n");
    }
  } else if (root.name === "hash") {
    const status = root.element("status")?.value;
    const message = root.element("error")?.value;
    if (message && message !== "") {
      error = [status, message].filter((v) => v !== undefined).join(" ");
    }
  } else {
    // GoodreadsResponse/error, matching the XPath in the C# fallback branch.
    const element = root.name === "GoodreadsResponse" ? root.element("error") : null;
    if (element) {
      const plain = element.value;
      const genericMessage = element.element("generic")?.value ?? null;
      const detailMessage = element.element("detail")?.value ?? null;
      const friendlyMessage = element.element("friendly")?.value ?? null;
      error = friendlyMessage ?? detailMessage ?? genericMessage ?? plain;
    }
  }

  if (error !== null && error.trim() !== "") {
    throw new GoodreadsException("Received an error from Goodreads " + error);
  }
}

/**
 * Ported from `HttpResponseExtensions.Deserialize<T>(this HttpResponse,
 * string elementName)`. `elementName` is required here (unlike C#'s
 * optional-with-`ElementName`-fallback default) since this port has no
 * per-resource `ElementName` to fall back to -- every one of this module's
 * three callers already passes an explicit name (matching the C# call
 * sites, which all do too: `"reviews"`, `"shelves"`, `"owned_books"`).
 */
export function deserializeGoodreadsResponse<T>(
  content: string,
  elementName: string,
  parseItem: (el: XElement) => T
): T[] | null {
  throwIfGoodreadsError(content);

  let document: XElement;
  try {
    document = XElement.parse(content);
  } catch {
    return null;
  }

  if (document.name === "error") {
    return null;
  }

  // Ported from `var root = document.Element("GoodreadsResponse") ?? (XNode)document;
  // var contentRoot = root.XPathSelectElement(elementName ?? responseObject.ElementName);`
  // -- `XElement.parse()` already returns the parsed root element itself
  // (typically `<GoodreadsResponse>`), which is exactly what C#'s
  // `document.Element("GoodreadsResponse")` resolves to for every real
  // Goodreads response (the doc root IS that element); `XPathSelectElement`
  // with a bare (no leading `/`) name matches a direct child, i.e. the same
  // as this port's `.element(name)`.
  const contentRoot = document.element(elementName);

  if (!contentRoot) {
    return null;
  }

  return contentRoot.elements().map(parseItem);
}
