import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixMultipleMonitoredEditions.cs.
 *
 * Readarr allows only one monitored Edition per Book. If a bug elsewhere
 * left multiple Editions of the same Book monitored simultaneously, this
 * re-monitors only the lowest-id Edition among that group (setting
 * "Monitored" back to true/1 on it) -- it does NOT unmonitor the others.
 *
 * NOTE this is the literal, faithful translation of the real C# SQL: the
 * `SELECT MIN("Id") ... WHERE "Monitored" = 1 GROUP BY "BookId" HAVING
 * COUNT("BookId") > 1` subquery selects the lowest-id row *from the
 * already-monitored duplicates*, then the outer `UPDATE ... SET
 * "Monitored" = 1` sets it to the same value it already had. The task's
 * name/intent ("fix multiple monitored editions") suggests the real goal
 * was probably to *unmonitor* the extras, but that is not what the shipped
 * SQL does -- ported here exactly as the real source runs it (a
 * behaviorally inert statement that always re-sets an already-true value on
 * a row that was already part of the offending group), not "fixed" to
 * unmonitor the duplicates. This port targets SQLite only, so only the
 * SQLite branch (`"Monitored" = 0` / `= 1` literals) is ported -- the C#
 * PostgreSQL branch (`= true`) is never reached in this port.
 */
export class FixMultipleMonitoredEditions implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `UPDATE "Editions"
         SET "Monitored" = 1
         WHERE "Id" IN (
           SELECT MIN("Id")
           FROM "Editions"
           WHERE "Monitored" = 1
           GROUP BY "BookId"
           HAVING COUNT("BookId") > 1
         )`
      )
      .run();
  }
}
