import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupDuplicateMetadataFiles.cs.
 *
 * Deletes duplicate "MetadataFiles" rows, keeping the highest ("MAX") id
 * per (AuthorId|BookId|BookFileId, Consumer) group and removing every
 * lower/older duplicate -- wait: the real C# deletes `MIN("Id")` per group,
 * i.e. it keeps the *newest* row and removes the *oldest* duplicate. Ported
 * verbatim (MIN, not MAX) -- faithful to the original even though "keep the
 * newest" is a slightly unusual choice for a dedup task.
 *
 * "Type" values: 1 = author metadata (AuthorMetadata), 2/4 = book/book-file
 * metadata (matches C#'s hardcoded `Type = 1` / `Type IN (2, 4)` literals --
 * these correspond to `MetadataFileType.AuthorMetadata`,
 * `MetadataFileType.BookMetadata`/`BookImage` in
 * NzbDrone.Core/Extras/Metadata/Files/MetadataFileType.cs, ported here as
 * the same literal ints the C# source used rather than importing the enum,
 * matching the original's own literal-int style in this file).
 */
export class CleanupDuplicateMetadataFiles implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.deleteDuplicateAuthorMetadata();
    this.deleteDuplicateBookMetadata();
    this.deleteDuplicateBookFileMetadata();
  }

  private deleteDuplicateAuthorMetadata(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT MIN("Id") FROM "MetadataFiles"
           WHERE "Type" = 1
           GROUP BY "AuthorId", "Consumer"
           HAVING COUNT("AuthorId") > 1
         )`
      )
      .run();
  }

  private deleteDuplicateBookMetadata(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT MIN("Id") FROM "MetadataFiles"
           WHERE "Type" IN (2, 4)
           GROUP BY "BookId", "Consumer"
           HAVING COUNT("BookId") > 1
         )`
      )
      .run();
  }

  private deleteDuplicateBookFileMetadata(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT MIN("Id") FROM "MetadataFiles"
           WHERE "Type" IN (2, 4)
           GROUP BY "BookFileId", "Consumer"
           HAVING COUNT("BookFileId") > 1
         )`
      )
      .run();
  }
}
