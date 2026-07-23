import type { Command } from "./command.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/IExecute.cs.
 *
 * C#: `IExecute<TCommand> : IProcessMessage<TCommand> where TCommand :
 * Command { void Execute(TCommand message); }` -- implemented by every
 * command-handler service (e.g. `RssSyncService : IExecute<RssSyncCommand>`).
 * `execute` is typed `Promise<void> | void` rather than a bare sync `void`:
 * unlike C#'s synchronous `Execute`, most real Node command handlers do
 * genuine I/O (disk scans, HTTP calls, DB writes) and need to `await`
 * inside -- matching this port's established "interface allows sync or
 * async implementations" convention (see `iHandle.ts`'s doc comment on
 * `HandleAsync`, and download-tracking/downloadMonitoringService.ts's
 * `execute*` methods, which are already real `async` methods waiting for
 * this exact interface to land).
 */
export interface IExecute<TCommand extends Command> {
  execute(message: TCommand): void | Promise<void>;
}
