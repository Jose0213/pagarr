import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupAbsolutePathMetadataFiles.cs.
 *
 * Deletes "MetadataFiles" rows whose "RelativePath" looks like an absolute
 * path (a Windows drive-letter path `X:\...`, a leading backslash `\...`,
 * or a leading forward slash `/...`) -- these should always be *relative*
 * to the author folder; rows with an absolute path are historical bad data
 * from an older bug.
 *
 * This port targets SQLite only (see db/database.ts's `DatabaseType` doc
 * comment -- Pagarr never runs the PostgreSQL branch the C# source
 * conditionally used), so only the SQLite `LIKE` pattern branch is ported
 * (`'_:\%'`, `'\%'`, `'/%'` -- SQLite's default LIKE escape is `\` is a
 * literal backslash there since no `ESCAPE` clause is specified, so `\%`
 * matches a literal backslash followed by any characters, and `_` is
 * SQLite's LIKE single-character wildcard, matching "any drive letter").
 */
export class CleanupAbsolutePathMetadataFiles implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "MetadataFiles"
         WHERE "Id" IN (
           SELECT "Id" FROM "MetadataFiles"
           WHERE "RelativePath" LIKE '_:\\%'
           OR "RelativePath" LIKE '\\%'
           OR "RelativePath" LIKE '/%'
         )`
      )
      .run();
  }
}
