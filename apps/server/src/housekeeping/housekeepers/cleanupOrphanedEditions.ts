import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedEditions.cs.
 *
 * Deletes "Editions" rows whose "BookId" no longer matches any "Books" row.
 */
export class CleanupOrphanedEditions implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "Editions"
         WHERE "Id" IN (
           SELECT "Editions"."Id" FROM "Editions"
           LEFT OUTER JOIN "Books"
           ON "Editions"."BookId" = "Books"."Id"
           WHERE "Books"."Id" IS NULL)`
      )
      .run();
  }
}
