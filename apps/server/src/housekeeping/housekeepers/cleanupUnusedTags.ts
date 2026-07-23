import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/** Tables whose "Tags" column (a JSON array of Tag ids) is scanned for tags still in use. */
const TAGGED_TABLES = [
  "Authors",
  "Notifications",
  "DelayProfiles",
  "ReleaseProfiles",
  "ImportLists",
  "Indexers",
  "DownloadClients",
] as const;

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupUnusedTags.cs.
 *
 * Scans every taggable table's "Tags" JSON-array column for tag ids
 * actually referenced anywhere, then deletes every "Tags" row whose id
 * isn't in that used-set. This port targets SQLite only (see
 * db/database.ts's `DatabaseType` doc comment), so only the SQLite branch
 * (`WHERE NOT "Id" IN (...)`) is ported -- the C# source's PostgreSQL
 * branch used `= ANY ('{...}'::int[])` array syntax that has no SQLite
 * equivalent and is never reached in this port.
 */
export class CleanupUnusedTags implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    const conn = this.database.openConnection();

    const usedTags = Array.from(
      new Set(TAGGED_TABLES.flatMap((table) => this.getUsedTags(table, conn)))
    );

    if (usedTags.length > 0) {
      const placeholders = usedTags.map(() => "?").join(", ");
      conn.prepare(`DELETE FROM "Tags" WHERE NOT "Id" IN (${placeholders})`).run(...usedTags);
    } else {
      conn.prepare(`DELETE FROM "Tags"`).run();
    }
  }

  private getUsedTags(table: string, conn: DatabaseSync): number[] {
    const rows = conn
      .prepare(
        `SELECT DISTINCT "Tags" FROM "${table}" WHERE NOT "Tags" = '[]' AND NOT "Tags" IS NULL`
      )
      .all() as unknown as { Tags: string }[];

    const ids = new Set<number>();
    for (const row of rows) {
      const parsed = JSON.parse(row.Tags) as number[];
      for (const id of parsed) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  }
}
