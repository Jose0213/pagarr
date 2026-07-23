import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureRunScheduledTasks.cs.
 *
 * Clamps every "ScheduledTasks" row's "LastExecution" that's in the future
 * back down to now.
 *
 * PRESERVED C# BUG -- the `if (BuildInfo.IsDebug) { _logger.Debug(...) }`
 * guard only *logs* "Not running scheduled task last execution cleanup
 * during debug" -- it never actually `return`s or skips the UPDATE that
 * follows. So the cleanup runs unconditionally in every build, debug or
 * not, despite the log message's claim. Ported faithfully: `onDebugLog` is
 * called (matching the log side effect) but the UPDATE always executes
 * regardless, exactly like the real source. `BuildInfo.IsDebug` itself has
 * no port here (no Common/EnvironmentInfo module ported yet) -- `isDebug`
 * is a plain injected boolean (defaulting to `false`, i.e. "release build")
 * so the log-only side effect is reproducible without a real BuildInfo
 * port, while the actual cleanup behavior (which never depended on it) is
 * unaffected either way.
 */
export class FixFutureRunScheduledTasks implements IHousekeepingTask {
  constructor(
    private readonly database: IDatabase,
    private readonly isDebug = false,
    private readonly onDebugLog?: (message: string) => void
  ) {}

  clean(): void {
    if (this.isDebug) {
      this.onDebugLog?.("Not running scheduled task last execution cleanup during debug");
    }

    const nowIso = new Date().toISOString();

    this.database
      .openConnection()
      .prepare(
        `UPDATE "ScheduledTasks"
         SET "LastExecution" = ?
         WHERE "LastExecution" > ?`
      )
      .run(nowIso, nowIso);
  }
}
