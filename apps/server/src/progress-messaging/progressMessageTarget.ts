import type { CommandModel } from "../messaging/commands/commandModel.js";
import { ProgressMessageContext } from "../messaging/commands/progressMessageContext.js";
import type { IManageCommandQueue } from "../messaging/commands/commandQueueManager.js";
import type { IEventAggregator } from "../messaging/events/iEventAggregator.js";
import { CommandUpdatedEvent } from "./commandUpdatedEvent.js";

/**
 * Stand-in for NLog's `LogEventInfo`, trimmed to the fields
 * `ProgressMessageTarget.Write()` actually reads. Same approach as
 * `instrumentation/databaseTarget.ts`'s own `LogEventEntry` (see that
 * file's doc comment for why this port has no real NLog target/rule/layout
 * pipeline to hook into) -- a second, independent stand-in rather than a
 * shared one since the two targets read different slices of `LogEventInfo`
 * (DatabaseTarget reads `FormattedMessage`/`Exception`/`Level`/`LoggerName`;
 * this one reads `FormattedMessage` plus whether the "Status" structured
 * log property was set, which DatabaseTarget never inspects).
 */
export interface ProgressLogEventEntry {
  /** Ported from `LogEventInfo.FormattedMessage`. */
  message: string;
  /**
   * Ported from `LogEventInfo.Properties.ContainsKey("Status")` -- true iff
   * the log call was made through one of the `Logger.ProgressInfo`/
   * `ProgressDebug`/`ProgressTrace`-style extension methods (`NzbDrone.
   * Common/Instrumentation/Extensions/ProgressLogger.cs` in the real source,
   * not ported here -- see this module's final report) that attach a
   * "Status" structured property to the log event. Passed in explicitly by
   * the caller rather than inferred from a message string, since there's no
   * ported structured-logging layer to inspect for the real property.
   */
  hasStatusProperty: boolean;
}

/**
 * Ported from NzbDrone.Core/ProgressMessaging/ProgressMessageTarget.cs.
 *
 * ## Why this isn't a real NLog target
 *
 * Same rationale as `instrumentation/databaseTarget.ts` (see that file's
 * doc comment in full): this repo has no NLog target/rule/layout pipeline
 * wired in anywhere, so `Register()`/the `LoggingRule`/
 * `Handle(ApplicationStartedEvent)`'s `LogManager.Configuration.AddTarget`
 * call have no port here -- what's ported is `Write(LogEventInfo)`'s actual
 * behavior: given a log event that's flagged as a progress/status message
 * AND there's a currently-executing command that wants client updates,
 * update that command's message and publish `CommandUpdatedEvent`.
 *
 * `ProgressMessageContext` (the thread-local/AsyncLocal "which command is
 * currently executing" state this reads) is the REAL, already-merged port
 * at `messaging/commands/progressMessageContext.ts` -- not a forward-ref;
 * used directly here per this module's task instructions.
 */
export class ProgressMessageTarget {
  constructor(
    private readonly eventAggregator: IEventAggregator,
    private readonly commandQueueManager: IManageCommandQueue
  ) {}

  /** Ported from `ProgressMessageTarget.Write(LogEventInfo logEvent)`. */
  write(logEvent: ProgressLogEventEntry): void {
    const command = ProgressMessageContext.commandModel;

    if (!this.isClientMessage(logEvent, command)) {
      return;
    }

    if (!ProgressMessageContext.lockReentrancy()) {
      return;
    }

    try {
      this.commandQueueManager.setMessage(command as CommandModel, logEvent.message);
      this.eventAggregator.publishEvent(new CommandUpdatedEvent(command as CommandModel));
    } finally {
      ProgressMessageContext.unlockReentrancy();
    }
  }

  /** Ported from `ProgressMessageTarget.IsClientMessage(LogEventInfo, CommandModel)`. */
  private isClientMessage(logEvent: ProgressLogEventEntry, command: CommandModel | null): boolean {
    if (command === null || !command.body.sendUpdatesToClient) {
      return false;
    }

    return logEvent.hasStatusProperty;
  }
}
