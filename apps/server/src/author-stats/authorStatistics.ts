import type { BookStatistics } from "./bookStatistics.js";

/** Ported from NzbDrone.Core/AuthorStats/AuthorStatistics.cs. See bookStatistics.ts's doc comment on why `ResultSet` isn't ported as its own type. */
export interface AuthorStatistics {
  authorId: number;
  bookFileCount: number;
  bookCount: number;
  availableBookCount: number;
  totalBookCount: number;
  sizeOnDisk: number;
  bookStatistics: BookStatistics[];
}

/**
 * Ported from `AuthorStatistics`'s implicit default field values (C#
 * auto-properties on a `new AuthorStatistics()` all default to 0/null).
 * Used by `AuthorStatisticsService.AuthorStatistics(int authorId)`'s
 * empty-result path.
 */
export function newAuthorStatistics(): AuthorStatistics {
  return {
    authorId: 0,
    bookFileCount: 0,
    bookCount: 0,
    availableBookCount: 0,
    totalBookCount: 0,
    sizeOnDisk: 0,
    bookStatistics: undefined as unknown as BookStatistics[],
  };
}
