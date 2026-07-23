import type { IExecute } from "../messaging/commands/iExecute.js";
import type { IDatabase } from "../db/database.js";
import type { HousekeepingCommand } from "./housekeepingCommand.js";
import type { IHousekeepingTask } from "./iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/HousekeepingService.cs.
 *
 * C#: `IEnumerable<IHousekeepingTask>` is resolved by DI as "every
 * registered IHousekeepingTask implementation" -- per this port's
 * explicit-registry convention (no DI container; see
 * `messaging/commands/commandQueueManager.ts`'s doc comment for the
 * parallel adaptation on the Commands side), the caller passes an explicit
 * array of task instances instead. `housekeepers/index.ts` exports a
 * `createDefaultHousekeepingTasks(...)` factory that builds the real,
 * complete 33-task list in the same order as the original
 * `Housekeepers/*.cs` directory listing, for callers that want "the real
 * default set" without hand-assembling it.
 *
 * `Execute(HousekeepingCommand message)` just calls the private `Clean()`
 * -- both are folded into a single public `execute()` method here, since
 * TS has no private/public method split worth preserving for a
 * single-caller private method.
 *
 * Each task's `Clean()` is wrapped in its own try/catch so one failing
 * housekeeper doesn't prevent the rest from running (matching the C#
 * original's per-task try/catch + `_logger.Error(ex, ...)` inside the
 * `foreach` loop) -- `onTaskError`/`onDebug` are optional callbacks
 * standing in for the dropped NLog `Logger` (see `config/configService.ts`'s
 * doc comment for this port's established no-NLog-yet convention).
 *
 * `_mainDb.Vacuum()` runs unconditionally after every task, whether or not
 * any task actually deleted rows -- ported faithfully (not made
 * conditional on "did anything change").
 */
export class HousekeepingService implements IExecute<HousekeepingCommand> {
  constructor(
    private readonly housekeepers: readonly IHousekeepingTask[],
    private readonly mainDb: Pick<IDatabase, "vacuum">,
    private readonly onDebug?: (message: string, taskName?: string) => void,
    private readonly onTaskError?: (taskName: string, error: unknown) => void
  ) {}

  private async clean(): Promise<void> {
    this.onDebug?.("Running housecleaning tasks");

    for (const housekeeper of this.housekeepers) {
      const taskName = housekeeper.constructor.name;
      try {
        this.onDebug?.(`Starting ${taskName}`, taskName);
        await housekeeper.clean();
        this.onDebug?.(`Completed ${taskName}`, taskName);
      } catch (error) {
        this.onTaskError?.(taskName, error);
      }
    }

    // Vacuuming the log db isn't needed since that's done in a separate housekeeping task
    this.onDebug?.("Compressing main database after housekeeping");
    this.mainDb.vacuum();
  }

  async execute(_message: HousekeepingCommand): Promise<void> {
    await this.clean();
  }
}
