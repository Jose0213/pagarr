import type { CommandResult } from "./commandResult.js";
import type { IManageCommandQueue } from "./commandQueueManager.js";
import { ProgressMessageContext } from "./progressMessageContext.js";

/** Ported from NzbDrone.Core/Messaging/Commands/CommandResultReporter.cs. */
export interface ICommandResultReporter {
  report(result: CommandResult): void;
}

export class CommandResultReporter implements ICommandResultReporter {
  constructor(private readonly commandQueueManager: IManageCommandQueue) {}

  report(result: CommandResult): void {
    const command = ProgressMessageContext.commandModel;

    if (command === null) {
      return;
    }

    if (!ProgressMessageContext.lockReentrancy()) {
      return;
    }

    try {
      this.commandQueueManager.setResult(command, result);
    } finally {
      ProgressMessageContext.unlockReentrancy();
    }
  }
}
