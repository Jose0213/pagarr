import type { AuthorStatistics } from "../../../author-stats/index.js";

/**
 * Ported from Readarr.Api.V1/Author/AuthorStatisticsResource.cs.
 *
 * `percentOfBooks` is a computed C# property (`get`-only, `decimal`) --
 * ported as a function (`percentOfBooks()` below) rather than a stored
 * field, matching this port's established convention for computed
 * properties on plain-data resource shapes (see e.g. `AuthorResource.ended`
 * below, or `books/models.ts`'s `ratingsPopularity()`). `toResource()`
 * stamps it in as a plain number at mapping time so the wire shape still
 * matches the real JSON response (the real C# serializes computed
 * properties like any other member).
 */
export interface AuthorStatisticsResource {
  bookFileCount: number;
  bookCount: number;
  availableBookCount: number;
  totalBookCount: number;
  sizeOnDisk: number;
  /** Ported from `AuthorStatisticsResource.PercentOfBooks`'s computed getter -- see module doc comment. */
  percentOfBooks: number;
}

/** Ported from `AuthorStatisticsResource.PercentOfBooks => BookCount == 0 ? 0 : (decimal)AvailableBookCount / BookCount * 100`. */
export function percentOfBooks(bookCount: number, availableBookCount: number): number {
  if (bookCount === 0) {
    return 0;
  }
  return (availableBookCount / bookCount) * 100;
}

/** Ported from `AuthorStatisticsResourceMapper.ToResource(this AuthorStatistics model)`. */
export function authorStatisticsToResource(
  model: AuthorStatistics | null | undefined
): AuthorStatisticsResource | null {
  if (model === null || model === undefined) {
    return null;
  }

  return {
    bookFileCount: model.bookFileCount,
    bookCount: model.bookCount,
    availableBookCount: model.availableBookCount,
    totalBookCount: model.totalBookCount,
    sizeOnDisk: model.sizeOnDisk,
    percentOfBooks: percentOfBooks(model.bookCount, model.availableBookCount),
  };
}

/** Ported from a freshly-constructed `new AuthorStatisticsResource()` (all C# auto-properties default to 0) -- used by `AuthorResourceMapper.ToResource` for the `Statistics = new AuthorStatisticsResource()` placeholder every author resource starts with before stats are linked in. */
export function newAuthorStatisticsResource(): AuthorStatisticsResource {
  return {
    bookFileCount: 0,
    bookCount: 0,
    availableBookCount: 0,
    totalBookCount: 0,
    sizeOnDisk: 0,
    percentOfBooks: 0,
  };
}
