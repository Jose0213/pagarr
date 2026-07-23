import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { Log } from "./log.js";

/**
 * Ported from NzbDrone.Core/Instrumentation/LogRepository.cs.
 *
 * Column list matches db/migrations-log/0001_initial_setup.sql's "Logs"
 * table exactly (Message, Time, Logger, Exception, ExceptionType, Level --
 * all TEXT; Exception/ExceptionType nullable).
 */
const LOG_COLUMNS: ColumnMapping<Log>[] = [
  { prop: "message", column: "Message" },
  { prop: "time", column: "Time" },
  { prop: "logger", column: "Logger" },
  { prop: "exception", column: "Exception" },
  { prop: "exceptionType", column: "ExceptionType" },
  { prop: "level", column: "Level" },
];

export class LogRepository extends BasicRepository<Log> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Logs", columns: LOG_COLUMNS, eventAggregator });
  }

  /**
   * Ported from LogRepository.Trim(): deletes every log row at or before
   * 7 days ago (UTC, truncated to the date -- matching `DateTime.UtcNow.
   * AddDays(-7).Date`, i.e. midnight of that day), then reclaims disk space
   * via VACUUM. Called from DeleteLogFilesService's log-retention path (see
   * that module's doc comment for why the periodic-cleanup job trigger
   * itself isn't ported here).
   */
  trim(): void {
    const trimDate = new Date();
    trimDate.setUTCDate(trimDate.getUTCDate() - 7);
    trimDate.setUTCHours(0, 0, 0, 0);
    const trimDateIso = trimDate.toISOString();

    this.deleteOlderThan(trimDateIso);
    this.database.vacuum();
  }

  /**
   * `Delete(c => c.Time <= trimDate)` in C# is a predicate-based bulk delete
   * via WhereBuilder. This repo's `deleteMany()` only takes explicit
   * ids/models, so the matching rows are removed directly (a single SQL
   * DELETE ... WHERE, rather than SELECT-then-delete-by-id, since ISO-8601
   * string Time values compare correctly with a plain `<=` in SQLite). Named
   * `deleteOlderThan` (not `delete`) to avoid colliding with
   * BasicRepository's own `delete(modelOrId)` method.
   */
  private deleteOlderThan(trimDateIso: string): void {
    this.database.openConnection().prepare('DELETE FROM "Logs" WHERE "Time" <= ?').run(trimDateIso);
  }
}
