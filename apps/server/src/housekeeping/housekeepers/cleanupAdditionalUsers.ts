import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupAdditionalUsers.cs.
 *
 * Readarr is single-user; this deletes every "Users" row except the first
 * (same "no ORDER BY on the inner SELECT" caveat as
 * CleanupAdditionalNamingSpecs -- see that file's doc comment).
 */
export class CleanupAdditionalUsers implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "Users"
         WHERE "Id" NOT IN (
           SELECT "Id" FROM "Users"
           LIMIT 1)`
      )
      .run();
  }
}
