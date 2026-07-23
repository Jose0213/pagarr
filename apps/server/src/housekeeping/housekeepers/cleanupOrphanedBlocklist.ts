import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedBlocklist.cs.
 *
 * Deletes "Blocklist" rows whose "AuthorId" no longer matches any "Authors"
 * row. The "Blocklist" table (renamed from "Blacklist" -- see
 * db/migrations/0014_rename_blacklist_to_blocklist.sql) already exists in
 * this port's schema (Phase 0), even though the C# `Blocklisting` module
 * itself (a real repository/service layer over that table) hasn't been
 * ported yet (PORT_PLAN.md lists it as future Wave 2 work) -- same as the
 * real C# housekeeper, this task talks to the table directly via raw SQL,
 * not through a `BlocklistRepository`, so no forward-ref is needed here.
 */
export class CleanupOrphanedBlocklist implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "Blocklist"
         WHERE "Id" IN (
           SELECT "Blocklist"."Id" FROM "Blocklist"
           LEFT OUTER JOIN "Authors"
           ON "Blocklist"."AuthorId" = "Authors"."Id"
           WHERE "Authors"."Id" IS NULL)`
      )
      .run();
  }
}
