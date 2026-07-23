import type { IManageCommandQueue } from "../../messaging/commands/commandQueueManager.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupCommandQueue.cs.
 *
 * Thin delegate to `IManageCommandQueue.CleanCommands()` (already ported --
 * see `messaging/commands/commandQueueManager.ts`'s `cleanCommands()`,
 * itself the real port of `CommandQueueManager.CleanCommands()`).
 */
export class CleanupCommandQueue implements IHousekeepingTask {
  constructor(private readonly commandQueueManager: IManageCommandQueue) {}

  clean(): void {
    this.commandQueueManager.cleanCommands();
  }
}
