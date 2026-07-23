/**
 * Ported from NzbDrone.Core/Books/Services/MonitorNewBookService.cs.
 *
 * Deviation: the C# constructor took an NLog `Logger` with no other use in
 * the class body -- dropped for the same reason configService.ts drops
 * trace-only logging (Instrumentation, Phase 4, isn't ported yet, and
 * nothing here needs logging to behave correctly).
 */

import { NewItemMonitorTypes, type Book } from "./models.js";

export class MonitorNewBookService {
  /**
   * Ported from MonitorNewBookService.ShouldMonitorNewBook(Book addedBook,
   * List<Book> existingBooks, NewItemMonitorTypes monitorNewItems).
   *
   * - `None` -> never monitor a newly-added book.
   * - `All` -> always monitor.
   * - `New` -> monitor only if the added book's release date is on/after
   *   the latest existing book's release date (treating a missing release
   *   date as `DateTime.MinValue`, matching the C# `?? DateTime.MinValue`
   *   fallback via `MaxBy`).
   */
  shouldMonitorNewBook(
    addedBook: Book,
    existingBooks: Book[],
    monitorNewItems: NewItemMonitorTypes
  ): boolean {
    if (monitorNewItems === NewItemMonitorTypes.None) {
      return false;
    }

    if (monitorNewItems === NewItemMonitorTypes.All) {
      return true;
    }

    if (monitorNewItems === NewItemMonitorTypes.New) {
      const newest = existingBooks.reduce<string>((max, book) => {
        const releaseDate = book.releaseDate ?? MIN_DATE;
        return releaseDate > max ? releaseDate : max;
      }, MIN_DATE);

      const addedReleaseDate = addedBook.releaseDate ?? MIN_DATE;

      return addedReleaseDate >= newest;
    }

    throw new Error(`Unknown new item monitor type ${String(monitorNewItems)}`);
  }
}

/** DateTime.MinValue's ISO-comparable stand-in: ISO date strings sort lexicographically, so this sorts before any real date. */
const MIN_DATE = "0001-01-01T00:00:00.000Z";
