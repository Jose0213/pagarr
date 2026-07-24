import type { BookStatistics } from "../../../author-stats/bookStatistics.js";

/**
 * Ported from Readarr.Api.V1.Books/BookStatisticsResource.cs.
 *
 * `percentOfBooks` is a C# computed property (`BookFileCount /
 * (decimal)BookCount * 100`, 0 when BookCount is 0) -- ported as a function
 * rather than a stored field, matching this port's established convention
 * for computed getters on plain data shapes (see books/models.ts's
 * `ratingsPopularity`). Call sites that need the wire-serialized value
 * (this resource has no other computed fields the real JSON response
 * doesn't already carry as a stored field) can call `percentOfBooks(r)`
 * directly; `BookResource`'s own mapper does not need to since nothing in
 * this worktree's ported controllers reads it off the resource after
 * construction.
 */
export interface BookStatisticsResource {
  bookFileCount: number;
  bookCount: number;
  totalBookCount: number;
  sizeOnDisk: number;
}

/** Ported from `BookStatisticsResource.PercentOfBooks` computed getter. */
export function percentOfBooks(resource: BookStatisticsResource): number {
  if (resource.bookCount === 0) {
    return 0;
  }
  return (resource.bookFileCount / resource.bookCount) * 100;
}

/** Ported from BookStatisticsResourceMapper.ToResource(BookStatistics model). */
export function bookStatisticsToResource(
  model: BookStatistics | null | undefined
): BookStatisticsResource | null {
  if (!model) {
    return null;
  }

  return {
    bookFileCount: model.bookFileCount,
    bookCount: model.bookCount,
    sizeOnDisk: model.sizeOnDisk,
    totalBookCount: model.totalBookCount,
  };
}
