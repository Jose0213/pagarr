import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedSeriesBookLinks.cs.
 *
 * Deletes "SeriesBookLink" rows orphaned by Book, then rows orphaned by
 * Series (two separate DELETE statements against the same table, matching
 * the C# original's two separate `mapper.Execute` calls on one open
 * connection).
 */
export class CleanupOrphanedSeriesBookLinks implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    const conn = this.database.openConnection();

    conn
      .prepare(
        `DELETE FROM "SeriesBookLink"
         WHERE "Id" IN (
           SELECT "SeriesBookLink"."Id" FROM "SeriesBookLink"
           LEFT OUTER JOIN "Books"
           ON "SeriesBookLink"."BookId" = "Books"."Id"
           WHERE "Books"."Id" IS NULL)`
      )
      .run();

    conn
      .prepare(
        `DELETE FROM "SeriesBookLink"
         WHERE "Id" IN (
           SELECT "SeriesBookLink"."Id" FROM "SeriesBookLink"
           LEFT OUTER JOIN "Series"
           ON "SeriesBookLink"."SeriesId" = "Series"."Id"
           WHERE "Series"."Id" IS NULL)`
      )
      .run();
  }
}
