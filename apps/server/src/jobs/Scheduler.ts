import { CommandTrigger } from "./CommandTrigger.js";
import type { ITaskManager } from "./TaskManager.js";

/** Minimal logger surface Scheduler needs. */
export interface SchedulerLogger {
  trace(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
}

const noopLogger: SchedulerLogger = { trace: () => {}, info: () => {} };

/**
 * Ported from NzbDrone.Core/Jobs/Scheduler.cs's `IManageCommandQueue.Push()`
 * call site. FORWARD-REFERENCE: `IManageCommandQueue` itself lives in the
 * not-yet-ported `NzbDrone.Core.Messaging.Commands` module -- this is the
 * minimal slice of its surface Scheduler actually calls
 * (`Push(typeName, lastExecution, lastStartTime, priority, trigger)`),
 * narrowed the same way every other cross-module forward-reference in this
 * task is (see TaskManager.ts's doc comments for the fuller rationale).
 */
export interface CommandQueueManagerLike {
  push(
    typeName: string,
    lastExecution: string,
    lastStartTime: string,
    priority: number,
    trigger: CommandTrigger
  ): void;
}

/**
 * Ported from NzbDrone.Core/Jobs/Scheduler.cs.
 *
 * C#'s `System.Timers.Timer` (30-second interval, `Enabled = false` during
 * a tick to prevent re-entrancy, `Enabled = true` again in a `finally`
 * unless cancellation was requested) is ported as `setInterval`/
 * `clearInterval` with the same re-entrancy guard implemented manually
 * (Node's `setInterval` callback can itself take longer than the interval
 * and overlap, same risk `Timer.Enabled = false` guarded against in C#).
 * `CancellationTokenSource`/`Task.Factory.StartNew(...).LogExceptions()`
 * (fire-and-forget with exception logging) has no directly equivalent
 * primitive in the sync `ExecuteCommands` body ported here -- since
 * `getPending()`/`push()` are synchronous in this port (no I/O awaited
 * inside the loop itself), there's no async task to fire-and-forget; a
 * thrown error inside `executeCommands()` is caught and logged the same
 * way `.LogExceptions()` would have.
 *
 * `Handle(ApplicationStartedEvent)`/`Handle(ApplicationShutdownRequested)`
 * are ported as plain `start()`/`stop()` methods a caller invokes directly
 * -- same "no event bus yet" pattern as TaskManager.ts's `initialize()`.
 */
export class Scheduler {
  private static readonly TICK_INTERVAL_MS = 1000 * 30;

  private timer: ReturnType<typeof setInterval> | undefined;
  private stopRequested = false;
  private ticking = false;

  constructor(
    private readonly taskManager: ITaskManager,
    private readonly commandQueueManager: CommandQueueManagerLike,
    private readonly logger: SchedulerLogger = noopLogger,
    private readonly tickIntervalMs: number = Scheduler.TICK_INTERVAL_MS
  ) {}

  /** Ported from Scheduler.ExecuteCommands(). */
  private executeCommands(): void {
    if (this.ticking) {
      // Ported behavior: `Timer.Enabled = false` at the top of
      // ExecuteCommands prevents the .NET Timer from re-entering while a
      // tick is still running -- setInterval has no such guard built in,
      // so this flag substitutes for it.
      return;
    }

    this.ticking = true;
    try {
      const tasks = this.taskManager.getPending();

      this.logger.trace("Pending Tasks: %d", tasks.length);

      for (const task of tasks) {
        this.commandQueueManager.push(
          task.typeName,
          task.lastExecution,
          task.lastStartTime,
          task.priority,
          CommandTrigger.Scheduled
        );
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Ported from Scheduler.Handle(ApplicationStartedEvent). */
  start(): void {
    this.stopRequested = false;
    this.timer = setInterval(() => {
      if (!this.stopRequested) {
        this.executeCommands();
      }
    }, this.tickIntervalMs);
  }

  /** Ported from Scheduler.Handle(ApplicationShutdownRequested). */
  stop(): void {
    this.logger.info("Shutting down scheduler");
    this.stopRequested = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
