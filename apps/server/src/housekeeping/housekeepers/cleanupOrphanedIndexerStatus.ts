import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedIndexerStatus.cs.
 *
 * Deletes "IndexerStatus" rows whose "ProviderId" no longer matches any
 * "Indexers" row.
 */
export class CleanupOrphanedIndexerStatus implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "IndexerStatus"
         WHERE "Id" IN (
           SELECT "IndexerStatus"."Id" FROM "IndexerStatus"
           LEFT OUTER JOIN "Indexers"
           ON "IndexerStatus"."ProviderId" = "Indexers"."Id"
           WHERE "Indexers"."Id" IS NULL)`
      )
      .run();
  }
}
