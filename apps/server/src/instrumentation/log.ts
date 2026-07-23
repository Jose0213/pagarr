import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Instrumentation/Log.cs.
 *
 * One row in the "Logs" table (see db/migrations-log/0001_initial_setup.sql),
 * the DB-backed log store Readarr's System > Logs UI page reads from via
 * LogService.Paged(). `Time` is stored as an ISO-8601 string (this port's
 * general SQLite date convention -- see db/migrations' TEXT-typed date
 * columns), not a native Date instance, matching how every other ported
 * model represents C# `DateTime` columns.
 */
export interface Log extends ModelBase {
  message: string;
  time: string;
  logger: string;
  exception: string | null;
  exceptionType: string | null;
  level: string;
}
