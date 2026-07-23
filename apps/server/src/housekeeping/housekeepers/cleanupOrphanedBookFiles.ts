import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedBookFiles.cs.
 *
 * NOTE the real C# comment says "Unlink where books no longer exists" but
 * the SQL joins against "Editions", not "Books" -- ported faithfully as
 * written (join target is Editions, matching "BookFiles"."EditionId"), not
 * "fixed" to match the comment's wording. Sets "EditionId" = 0 (unlinks,
 * doesn't delete) any "BookFiles" row whose "EditionId" no longer matches
 * an "Editions" row.
 */
export class CleanupOrphanedBookFiles implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `UPDATE "BookFiles"
         SET "EditionId" = 0
         WHERE "Id" IN (
           SELECT "BookFiles"."Id" FROM "BookFiles"
           LEFT OUTER JOIN "Editions"
           ON "BookFiles"."EditionId" = "Editions"."Id"
           WHERE "Editions"."Id" IS NULL)`
      )
      .run();
  }
}
