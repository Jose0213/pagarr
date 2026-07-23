/**
 * Ported from NzbDrone.Core/AuthorStats/BookStatistics.cs.
 *
 * C#'s `ResultSet` (NzbDrone.Core.Datastore) is a marker base class for
 * Dapper-materialized query-result rows that aren't a real `ModelBase`
 * table entity -- no behavior of its own, so it's not ported as a type at
 * all here; `BookStatistics` is just a plain data interface, matching this
 * port's convention for other `ResultSet` subclasses (none ported yet
 * elsewhere, so this establishes the pattern: no `id`/`ModelBase` since
 * these rows have no primary key of their own).
 */
export interface BookStatistics {
  authorId: number;
  bookId: number;
  bookFileCount: number;
  bookCount: number;
  availableBookCount: number;
  totalBookCount: number;
  sizeOnDisk: number;
}
