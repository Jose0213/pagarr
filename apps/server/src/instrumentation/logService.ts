import type { PagingSpec } from "../db/paging-spec.js";
import type { Log } from "./log.js";
import type { LogRepository } from "./logRepository.js";
import type { ClearLogCommand } from "./commands.js";

/**
 * Ported from NzbDrone.Core/Instrumentation/LogService.cs.
 *
 * `IExecute<ClearLogCommand>` becomes a plain `execute(command)` method --
 * same "no command-bus dispatcher yet" deviation as every other ported
 * command handler in this port (see commands.ts's doc comment). A future
 * Messaging-module command dispatcher can route a `ClearLogCommand` instance
 * to this method directly; the parameter is accepted (unused) purely for
 * call-site shape fidelity with the C# `Execute(ClearLogCommand message)`
 * signature.
 */
export class LogService {
  constructor(private readonly logRepository: LogRepository) {}

  /** Ported from `LogService.Paged(PagingSpec<Log> pagingSpec)`. */
  paged(pagingSpec: PagingSpec<Log>): PagingSpec<Log> {
    return this.logRepository.getPaged(pagingSpec);
  }

  /** Ported from `LogService.Execute(ClearLogCommand message)`: `_logRepository.Purge(vacuum: true)`. */
  execute(_command: ClearLogCommand): void {
    this.logRepository.purge(true);
  }
}
