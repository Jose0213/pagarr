import type { IExecute } from "./iExecute.js";
import type { UnknownCommand } from "./unknownCommand.js";

/** Ported from NzbDrone.Core/Messaging/Commands/UnknownCommandExecutor.cs. No NLog `Logger` -- `_logger.Debug(...)` becomes an optional `onDebug` callback, matching this port's established no-NLog-yet convention (see config/configService.ts's doc comment). */
export class UnknownCommandExecutor implements IExecute<UnknownCommand> {
  constructor(private readonly onDebug?: (message: string) => void) {}

  execute(message: UnknownCommand): void {
    this.onDebug?.(`Ignoring unknown command ${message.contractName ?? ""}`);
  }
}
