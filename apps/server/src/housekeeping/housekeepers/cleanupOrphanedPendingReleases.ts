import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedPendingReleases.cs.
 *
 * Deletes "PendingReleases" rows whose "AuthorId" no longer matches any
 * "Authors" row.
 */
export class CleanupOrphanedPendingReleases implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "PendingReleases"
         WHERE "Id" IN (
           SELECT "PendingReleases"."Id" FROM "PendingReleases"
           LEFT OUTER JOIN "Authors"
           ON "PendingReleases"."AuthorId" = "Authors"."Id"
           WHERE "Authors"."Id" IS NULL)`
      )
      .run();
  }
}
