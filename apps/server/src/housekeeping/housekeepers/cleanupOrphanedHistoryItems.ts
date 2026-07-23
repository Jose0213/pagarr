import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedHistoryItems.cs.
 *
 * Deletes "History" rows orphaned by author or by book. The "History" table
 * (db/migrations/0001_initial_setup.sql) already exists in this port's
 * schema (with "AuthorId"/"BookId" columns matching the C# model exactly),
 * even though the C# `History` module itself (a real repository/service
 * layer, `NzbDrone.Core.History`) hasn't been ported yet (PORT_PLAN.md:
 * "History (3 files)" is future Wave 2 work) -- note this is a *different*
 * table from this port's already-real `DownloadHistory`
 * (download-tracking/history/), which is the port of C#'s
 * `NzbDrone.Core.Download.History.DownloadHistory` (download-attempt
 * bookkeeping), not `NzbDrone.Core.History.History` (grab/import/rename
 * event log). Same as the real C# housekeeper, this task talks to the
 * table directly via raw SQL, not through a `HistoryRepository`, so no
 * forward-ref is needed here.
 */
export class CleanupOrphanedHistoryItems implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.cleanupOrphanedByAuthor();
    this.cleanupOrphanedByBook();
  }

  private cleanupOrphanedByAuthor(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "History"
         WHERE "Id" IN (
           SELECT "History"."Id" FROM "History"
           LEFT OUTER JOIN "Authors"
           ON "History"."AuthorId" = "Authors"."Id"
           WHERE "Authors"."Id" IS NULL)`
      )
      .run();
  }

  private cleanupOrphanedByBook(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "History"
         WHERE "Id" IN (
           SELECT "History"."Id" FROM "History"
           LEFT OUTER JOIN "Books"
           ON "History"."BookId" = "Books"."Id"
           WHERE "Books"."Id" IS NULL)`
      )
      .run();
  }
}
