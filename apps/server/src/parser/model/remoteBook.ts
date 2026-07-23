import type { Author, Book } from "../../books/index.js";
import type { ParsedBookInfo } from "./parsedBookInfo.js";
import { ReleaseSourceType, type ReleaseInfo } from "./releaseInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/RemoteBook.cs.
 *
 * `Author`/`Book` are the real ported `apps/server/src/books/` entities
 * (Phase 1, already landed) -- not forward-references. `CustomFormat`
 * (NzbDrone.Core.CustomFormats) and `TorrentSeedConfiguration`
 * (NzbDrone.Core.Download.Clients) are Phase 2/3 modules not yet ported;
 * `customFormats` is typed `unknown[]` and `seedConfiguration` `unknown`
 * as narrow placeholders preserving the field's presence/shape without
 * depending on those modules' real types before they exist.
 */
export interface RemoteBook {
  release: ReleaseInfo | null;
  parsedBookInfo: ParsedBookInfo | null;
  author: Author | null;
  books: Book[];
  downloadAllowed: boolean;
  seedConfiguration: unknown;
  customFormats: unknown[];
  customFormatScore: number;
  releaseSource: ReleaseSourceType;
}

/** Ported from the `RemoteBook()` constructor: Books/CustomFormats default to empty lists, not null. */
export function newRemoteBook(): RemoteBook {
  return {
    release: null,
    parsedBookInfo: null,
    author: null,
    books: [],
    downloadAllowed: false,
    seedConfiguration: null,
    customFormats: [],
    customFormatScore: 0,
    releaseSource: ReleaseSourceType.Unknown,
  };
}

/**
 * Ported from `RemoteBook.IsRecentBook()`:
 * `Books.Any(e => e.ReleaseDate >= DateTime.UtcNow.Date.AddDays(-14))`.
 * `Book.releaseDate` is `string | null` in the ported Books module; a null
 * releaseDate can never satisfy the comparison (mirrors C#'s
 * `DateTime?.CompareTo` treating a null/unset date as not-recent).
 */
export function isRecentBook(remoteBook: RemoteBook): boolean {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);

  return remoteBook.books.some((b) => b.releaseDate !== null && new Date(b.releaseDate) >= cutoff);
}

/** Ported from `RemoteBook.ToString() => Release.Title`. */
export function remoteBookToString(remoteBook: RemoteBook): string | null {
  return remoteBook.release?.title ?? null;
}
