import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedBooks.cs.
 *
 * Deletes "Books" rows whose "AuthorMetadataId" no longer matches any
 * "Authors" row (joined via "Authors"."AuthorMetadataId", not
 * "Authors"."Id" -- Books links to an author's metadata, not the Authors
 * row's own primary key).
 */
export class CleanupOrphanedBooks implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "Books"
         WHERE "Id" IN (
           SELECT "Books"."Id" FROM "Books"
           LEFT OUTER JOIN "Authors"
           ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
           WHERE "Authors"."Id" IS NULL)`
      )
      .run();
  }
}
