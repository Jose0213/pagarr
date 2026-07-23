import type { LocalBook } from "../../../../parser/model/localBook.js";
import type { IAggregate } from "./aggregateLocalTrack.js";

/**
 * Forward-reference for NzbDrone.Core/Books/Calibre/CalibreBook.cs +
 * CalibreProxy.cs's `ICached<CalibreBook>` cache (Books.Calibre module,
 * out of scope for this port -- Calibre library integration isn't part of
 * this worktree's SCOPE). Narrowed to the exact shape
 * `AggregateCalibreData` reads: `Id`, `Identifiers` (a string->string
 * lookup for mobi-asin/asin/isbn/goodreads keys), `Authors`, `Title`.
 */
export interface CalibreBookLike {
  id: number;
  identifiers: Record<string, string | undefined>;
  authors: string[];
  title: string;
}

/**
 * Forward-reference for `NzbDrone.Common.Cache.ICached<CalibreBook>`
 * (Common.Cache module, not ported) as used by `AggregateCalibreData`:
 * only `Find(key)` is called.
 */
export interface CalibreBookCache {
  find(path: string): CalibreBookLike | undefined;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/Aggregators/AggregateCalibreData.cs.
 * No-op (`find` always returns undefined) when no `CalibreBookCache` is
 * injected, matching this module's "Calibre integration out of scope,
 * degrade gracefully rather than break" stance for the rest of this file's
 * dependents.
 */
export class AggregateCalibreData implements IAggregate<LocalBook> {
  constructor(private readonly bookCache: CalibreBookCache = { find: () => undefined }) {}

  aggregate(localTrack: LocalBook): LocalBook {
    const book = this.bookCache.find(localTrack.path);

    if (book !== undefined) {
      localTrack.calibreId = book.id;

      const parsed = localTrack.fileTrackInfo;
      if (parsed !== null) {
        parsed.asin = book.identifiers["mobi-asin"] ?? book.identifiers["asin"] ?? null;
        parsed.isbn = book.identifiers["isbn"] ?? null;
        parsed.goodreadsId = book.identifiers["goodreads"] ?? null;
        parsed.authors = book.authors;
        parsed.bookTitle = book.title;
      }
    }

    return localTrack;
  }
}
