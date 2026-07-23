import type { IExecute } from "./iExecute.js";
import type { MessagingCleanupCommand } from "./messagingCleanupCommand.js";
import type { IManageCommandQueue } from "./commandQueueManager.js";

/** Ported from NzbDrone.Core/Messaging/Commands/CleanupCommandMessagingService.cs. */
export class CleanupCommandMessagingService implements IExecute<MessagingCleanupCommand> {
  constructor(private readonly commandQueueManager: IManageCommandQueue) {}

  execute(_message: MessagingCleanupCommand): void {
    this.commandQueueManager.cleanCommands();
  }
}
