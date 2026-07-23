import type { XElement } from "./xml/XElement.js";

/**
 * Ported from NzbDrone.Core/Indexers/XElementExtensions.cs. C# extension
 * methods on `XElement` become plain functions taking the element as the
 * first argument.
 */

const REMOVE_TIME_ZONE_REGEX = /\s[A-Z]{2,4}$/;

export function xTitle(item: XElement): string {
  return tryGetValue(item, "title", "Unknown");
}

export function xStripNameSpace(_root: XElement): XElement {
  // Not ported: this repo's XElement adapter (xml/XElement.ts) matches by
  // literal prefixed tag name rather than expanded-namespace XName (see
  // that file's doc comment), so there is no namespace URI attached to a
  // tag name to strip in the first place -- the C# method's entire purpose
  // (rebuild the tree with namespace-qualified names replaced by their
  // local names) is a no-op under this adapter's model. Kept unimplemented
  // rather than silently returning a lossy "no-op" that would misrepresent
  // parity with the source; no ported call site needs it (RssParser never
  // calls StripNameSpace).
  throw new Error("xStripNameSpace is not implemented -- see doc comment");
}

/**
 * Ported from XElementExtensions.ParseDate(string dateString). C#'s
 * `DateTime.TryParse(..., DateTimeStyles.AssumeUniversal)` treats an
 * unqualified date/time as UTC before converting `.ToUniversalTime()`
 * (a no-op once already UTC); a date *with* an explicit offset/zone
 * converts normally. `Date.parse`/`new Date(string)` already assumes UTC
 * for a bare ISO-ish string with no offset and honors an explicit offset
 * when present, so this mirrors that same behavior. The regex fallback
 * (stripping a trailing 2-4 letter timezone abbreviation like "PST" that
 * `Date` can't parse) is ported directly.
 */
export function parseDate(dateString: string): Date {
  let result = new Date(dateString);

  if (Number.isNaN(result.getTime())) {
    const stripped = dateString.replace(REMOVE_TIME_ZONE_REGEX, "");
    result = new Date(stripped);
  }

  if (Number.isNaN(result.getTime())) {
    throw new RangeError(`Unable to parse ${dateString}`);
  }

  return result;
}

export function xPublishDate(item: XElement): Date {
  const dateString = tryGetValue(item, "pubDate");
  return parseDate(dateString);
}

export function xLinks(item: XElement): string[] {
  return item.elements("link").map((link) => link.value);
}

export function xDescription(item: XElement): string {
  return tryGetValue(item, "description");
}

export function xComments(item: XElement): string {
  return tryGetValue(item, "comments");
}

export function xLength(item: XElement): number {
  return Number.parseInt(tryGetValue(item, "length"), 10);
}

/** Ported from XElementExtensions.TryGetValue(XElement item, string elementName, string defaultValue = ""). */
export function tryGetValue(item: XElement, elementName: string, defaultValue = ""): string {
  const element = item.element(elementName);
  return element !== null ? element.value : defaultValue;
}

/**
 * Ported from the generic `XElementExtensions.TryGetValue<T>(XElement item,
 * string elementName, T defaultValue)` overload. TS has no runtime
 * `Convert.ChangeType`, so this only supports the two instantiations that
 * are actually used by ported call sites (number and boolean); callers
 * needing plain strings should use `tryGetValue` above.
 */
export function tryGetNumberValue(
  item: XElement,
  elementName: string,
  defaultValue: number
): number {
  const element = item.element(elementName);

  if (element === null || element.value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(element.value);

  return Number.isNaN(parsed) ? defaultValue : parsed;
}
