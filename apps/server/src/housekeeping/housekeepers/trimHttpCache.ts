import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/TrimHttpCache.cs.
 *
 * Deletes every "HttpResponse" row (in the cache DB, not the main DB --
 * see `db/db-factory.ts`'s `CacheDatabase`) whose "Expiry" is before
 * today's date, then VACUUMs the cache database to reclaim disk space.
 * "Expiry" is compared against SQLite's `date('now')` (date-only, no time
 * component, UTC) -- matching the C# original's raw SQL exactly rather than
 * pre-computing a JS Date, since ISO-8601 "Expiry" strings sort/compare
 * correctly against SQLite's own `date('now')` output.
 */
export class TrimHttpCache implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(`DELETE FROM "HttpResponse" WHERE "Expiry" < date('now')`)
      .run();

    this.database.vacuum();
  }
}
