import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedAuthorMetadata.cs.
 *
 * Deletes "AuthorMetadata" rows referenced by neither a "Books" row nor an
 * "Authors" row (double LEFT OUTER JOIN, both must miss for a row to be
 * considered orphaned).
 */
export class CleanupOrphanedAuthorMetadata implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "AuthorMetadata"
         WHERE "Id" IN (
           SELECT "AuthorMetadata"."Id" FROM "AuthorMetadata"
           LEFT OUTER JOIN "Books" ON "Books"."AuthorMetadataId" = "AuthorMetadata"."Id"
           LEFT OUTER JOIN "Authors" ON "Authors"."AuthorMetadataId" = "AuthorMetadata"."Id"
           WHERE "Books"."Id" IS NULL AND "Authors"."Id" IS NULL)`
      )
      .run();
  }
}
