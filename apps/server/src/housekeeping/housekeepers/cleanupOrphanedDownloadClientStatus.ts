import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedDownloadClientStatus.cs.
 *
 * Deletes "DownloadClientStatus" rows whose "ProviderId" no longer matches
 * any "DownloadClients" row.
 */
export class CleanupOrphanedDownloadClientStatus implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "DownloadClientStatus"
         WHERE "Id" IN (
           SELECT "DownloadClientStatus"."Id" FROM "DownloadClientStatus"
           LEFT OUTER JOIN "DownloadClients"
           ON "DownloadClientStatus"."ProviderId" = "DownloadClients"."Id"
           WHERE "DownloadClients"."Id" IS NULL)`
      )
      .run();
  }
}
