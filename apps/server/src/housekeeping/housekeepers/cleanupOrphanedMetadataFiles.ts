import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedMetadataFiles.cs.
 *
 * Five separate cleanup passes over "MetadataFiles":
 *   1. orphaned by Author (AuthorId no longer exists)
 *   2. orphaned by Book (BookId > 0 but no longer exists)
 *   3. orphaned by BookFile (BookFileId > 0 but no longer exists)
 *   4. rows with Type IN (2, 4) (book/book-file metadata -- see
 *      cleanupDuplicateMetadataFiles.ts's doc comment on these literals)
 *      whose BookId is still the zero-value default (never got linked)
 *   5. same Type filter, whose BookFileId is still the zero-value default
 */
export class CleanupOrphanedMetadataFiles implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.deleteOrphanedByAuthor();
    this.deleteOrphanedByBook();
    this.deleteOrphanedByTrackFile();
    this.deleteWhereBookIdIsZero();
    this.deleteWhereTrackFileIsZero();
  }

  private deleteOrphanedByAuthor(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT "MetadataFiles"."Id" FROM "MetadataFiles"
           LEFT OUTER JOIN "Authors"
           ON "MetadataFiles"."AuthorId" = "Authors"."Id"
           WHERE "Authors"."Id" IS NULL)`
      )
      .run();
  }

  private deleteOrphanedByBook(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT "MetadataFiles"."Id" FROM "MetadataFiles"
           LEFT OUTER JOIN "Books"
           ON "MetadataFiles"."BookId" = "Books"."Id"
           WHERE "MetadataFiles"."BookId" > 0
           AND "Books"."Id" IS NULL)`
      )
      .run();
  }

  private deleteOrphanedByTrackFile(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT "MetadataFiles"."Id" FROM "MetadataFiles"
           LEFT OUTER JOIN "BookFiles"
           ON "MetadataFiles"."BookFileId" = "BookFiles"."Id"
           WHERE "MetadataFiles"."BookFileId" > 0
           AND "BookFiles"."Id" IS NULL)`
      )
      .run();
  }

  private deleteWhereBookIdIsZero(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT "Id" FROM "MetadataFiles"
           WHERE "Type" IN (2, 4)
           AND "BookId" = 0)`
      )
      .run();
  }

  private deleteWhereTrackFileIsZero(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT "Id" FROM "MetadataFiles"
           WHERE "Type" IN (2, 4)
           AND "BookFileId" = 0)`
      )
      .run();
  }
}
