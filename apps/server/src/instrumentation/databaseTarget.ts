import type { LogDatabase } from "../db/db-factory.js";
import { cleanse } from "./cleanseLogMessage.js";

/**
 * Ported from NzbDrone.Core/Instrumentation/DatabaseTarget.cs +
 * NzbDrone.Core/Instrumentation/SlowRunningAsyncTargetWrapper.cs.
 *
 * ## Why this isn't an NLog target
 *
 * C#'s `DatabaseTarget` is an `NLog.Targets.TargetWithLayout` subclass:
 * NLog owns log-level filtering, formatting (`LogEventInfo.FormattedMessage`
 * from a Layout), routing to this target via a `LoggingRule`, and the
 * `IHandle<ApplicationShutdownRequested>` hook that unregisters it on
 * shutdown. This repo has no NLog equivalent wired in anywhere (see this
 * module's PR description for the grep-the-codebase survey -- every prior
 * module's "logging" is a `console.error`/optional-callback stand-in, and
 * that reconciliation is explicitly out of scope here). Reinventing NLog's
 * target/rule/layout pipeline to port one target class faithfully would be
 * wildly disproportionate to what this class actually *does*, which is:
 * take a structured log event, clean it, insert one row into the "Logs"
 * table.
 *
 * So this ports the *behavior*, not the NLog integration surface:
 *   - `write()` below is `DatabaseTarget.Write(LogEventInfo)`'s body,
 *     taking a plain `LogEventEntry` (this port's `LogEventInfo` stand-in)
 *     instead of an NLog type.
 *   - Postgres is out of scope for this port (PORT_PLAN.md: SQLite only --
 *     see db/database.ts's DatabaseType doc comment), so only
 *     `WriteSqliteLog`'s path is ported; `WritePostgresLog` has no
 *     counterpart.
 *   - `Register()`/`UnRegister()`/`Rule`/`OnLogManagerOnConfigurationReloaded`
 *     are NLog target-registration plumbing with nothing to register
 *     against here -- omitted. `Handle(ApplicationShutdownRequested)`
 *     (which just calls `UnRegister()` if still registered) has nothing to
 *     port for the same reason; `DatabaseTarget.close()` below is this
 *     class's own equivalent shutdown hook (flush the pending batch, since
 *     there's no NLog LogManager to do that automatically).
 *
 * ## SlowRunningAsyncTargetWrapper -> writeBatched()
 *
 * The C# target is always wrapped in `SlowRunningAsyncTargetWrapper` with
 * `TimeToSleepBetweenBatches = 500`: NLog's `AsyncTargetWrapper` queues
 * writes off the logging call's thread, and the "SlowRunning" subclass
 * collapses the wrapper's usual per-write timer restart into a single
 * timer that keeps running (state machine in that file's `_state` field)
 * as long as more work keeps arriving, only stopping once the queue drains
 * -- i.e. it coalesces a burst of log writes into fewer flush passes rather
 * than firing the underlying target once per event. That coalescing
 * behavior (not NLog's queue/thread machinery specifically) is genuinely
 * portable and worth keeping: `DatabaseTarget.writeBatched()` buffers
 * incoming events and flushes them in one SQLite transaction after a
 * `flushDelayMs` (default 500, matching `TimeToSleepBetweenBatches`) quiet
 * period, restarting the timer if more events arrive before it fires --
 * the same "keep draining until idle" shape as the C# state machine,
 * implemented directly against a `setTimeout` instead of NLog's internal
 * async queue.
 */

/** Stand-in for NLog's `LogEventInfo`, trimmed to the fields DatabaseTarget.Write() actually reads. */
export interface LogEventEntry {
  /** ISO-8601 timestamp. Ported from `LogEventInfo.TimeStamp`. */
  time: string;
  /** Ported from `LogEventInfo.LoggerName`. */
  loggerName: string;
  /** Ported from `LogEventInfo.Level.Name` (e.g. "Info", "Error"). */
  level: string;
  /** Ported from `LogEventInfo.FormattedMessage`. */
  message: string;
  /** Ported from `LogEventInfo.Exception`, if any. */
  exception?: { message: string; stack: string; typeName: string };
}

/**
 * Ported from the one-time-formatted `INSERT_COMMAND` constant + its SQLite
 * bind-parameter path (`WriteSqliteLog`).
 */
const INSERT_LOG_SQL =
  'INSERT INTO "Logs" ("Message","Time","Logger","Exception","ExceptionType","Level") VALUES (?, ?, ?, ?, ?, ?)';

/**
 * Ported from `DatabaseTarget.Write(LogEventInfo)`'s body: builds the `Log`
 * row for one event (prefix-strip the logger name, fold the exception into
 * the message, cleanse both) without touching the database. Exported
 * separately from `write()`/`writeBatched()` so the transform itself is
 * unit-testable without a real LogDatabase.
 */
export function buildLogRow(entry: LogEventEntry): {
  message: string;
  time: string;
  logger: string;
  exception: string | null;
  exceptionType: string | null;
  level: string;
} {
  // Ported from `if (log.Logger.StartsWith("NzbDrone.")) { log.Logger =
  // log.Logger.Remove(0, 9); }`. This port has no dotted-namespace logger
  // naming convention in practice (nothing constructs logger names as
  // "NzbDrone.X"), but the strip is kept for literal behavioral fidelity in
  // case a caller passes that exact prefix through.
  let logger = entry.loggerName;
  if (logger.startsWith("NzbDrone.")) {
    logger = logger.slice(9);
  }

  let message = entry.message;
  let exception: string | null = null;
  let exceptionType: string | null = null;

  if (entry.exception) {
    message =
      message.trim() === "" ? entry.exception.message : message + ": " + entry.exception.message;
    exception = cleanse(entry.exception.stack) ?? entry.exception.stack;
    exceptionType = entry.exception.typeName;
  }

  return {
    message: cleanse(message) ?? message,
    time: entry.time,
    logger,
    exception,
    exceptionType,
    level: entry.level,
  };
}

export class DatabaseTarget {
  private pending: LogEventEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly logDatabase: LogDatabase,
    private readonly flushDelayMs = 500,
    /** Stand-in for NLog's `InternalLogger.Error(ex, "Unable to save log event to database")`. */
    private readonly onWriteError?: (error: unknown) => void
  ) {}

  /**
   * Ported from `DatabaseTarget.Write(LogEventInfo)`: writes a single event
   * to the "Logs" table immediately (synchronously), matching what the
   * un-wrapped `Write()` method itself does -- batching is a property of the
   * `SlowRunningAsyncTargetWrapper` layered in front of it (see
   * `writeBatched()` below), not of `Write()` itself.
   */
  write(entry: LogEventEntry): void {
    const row = buildLogRow(entry);

    try {
      this.logDatabase
        .openConnection()
        .prepare(INSERT_LOG_SQL)
        .run(row.message, row.time, row.logger, row.exception, row.exceptionType, row.level);
    } catch (err) {
      // Ported from the C# catch (SQLiteException) block: log-and-rethrow.
      this.onWriteError?.(err);
      throw err;
    }
  }

  /**
   * Ported from the `SlowRunningAsyncTargetWrapper` coalescing behavior
   * layered in front of `Write()` in production (see this module's doc
   * comment). Buffers `entry` and schedules (or extends) a flush after
   * `flushDelayMs` of inactivity, so a burst of log calls in quick
   * succession becomes one batched transaction instead of one write per
   * call.
   */
  writeBatched(entry: LogEventEntry): void {
    this.pending.push(entry);

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => this.flush(), this.flushDelayMs);
  }

  /**
   * Flushes any buffered `writeBatched()` events in one transaction. Ported
   * equivalent of `SlowRunningAsyncTargetWrapper` draining its queue; also
   * doubles as this class's shutdown hook (see `close()`).
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.pending.length === 0) {
      return;
    }

    const batch = this.pending;
    this.pending = [];

    const conn = this.logDatabase.openConnection();
    const stmt = conn.prepare(INSERT_LOG_SQL);

    conn.exec("BEGIN");
    try {
      for (const entry of batch) {
        const row = buildLogRow(entry);
        stmt.run(row.message, row.time, row.logger, row.exception, row.exceptionType, row.level);
      }
      conn.exec("COMMIT");
    } catch (err) {
      conn.exec("ROLLBACK");
      this.onWriteError?.(err);
      throw err;
    }
  }

  /**
   * Stand-in for `DatabaseTarget.Handle(ApplicationShutdownRequested)` ->
   * `UnRegister()` -> `Dispose()`: flush any buffered batched writes so
   * nothing is lost on shutdown. Callers using `writeBatched()` should call
   * this during graceful shutdown.
   */
  close(): void {
    this.flush();
  }
}
