import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedImportListStatus.cs.
 *
 * Deletes "ImportListStatus" rows whose "ProviderId" no longer matches any
 * "ImportLists" row. Both tables already exist in this port's schema
 * (db/migrations/0001_initial_setup.sql), even though the C# `ImportLists`
 * module itself (a real repository/service/provider-factory layer) hasn't
 * been ported yet (PORT_PLAN.md doesn't list it among ported Phase 1-4
 * modules) -- same as the real C# housekeeper, this task talks to both
 * tables directly via raw SQL, not through an `ImportListStatusRepository`/
 * `IImportListFactory`, so no forward-ref is needed here.
 */
export class CleanupOrphanedImportListStatus implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "ImportListStatus"
         WHERE "Id" IN (
           SELECT "ImportListStatus"."Id" FROM "ImportListStatus"
           LEFT OUTER JOIN "ImportLists"
           ON "ImportListStatus"."ProviderId" = "ImportLists"."Id"
           WHERE "ImportLists"."Id" IS NULL)`
      )
      .run();
  }
}
