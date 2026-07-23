import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupAdditionalNamingSpecs.cs.
 *
 * "NamingConfig" is a singleton-row table (Readarr has exactly one naming
 * configuration for the whole instance); this deletes every row except the
 * first, faithfully preserving the C# original's `NOT IN (SELECT "Id" FROM
 * "NamingConfig" LIMIT 1)` -- note there's no `ORDER BY` on that inner
 * SELECT, so "the first" is whatever row SQLite's query planner happens to
 * return first (typically, but not guaranteed to be, the lowest rowid).
 */
export class CleanupAdditionalNamingSpecs implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "NamingConfig"
         WHERE "Id" NOT IN (
           SELECT "Id" FROM "NamingConfig"
           LIMIT 1)`
      )
      .run();
  }
}
