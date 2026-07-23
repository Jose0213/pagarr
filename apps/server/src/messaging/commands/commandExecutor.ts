import type { Command } from "./command.js";
import type { CommandModel } from "./commandModel.js";
import type { IExecute } from "./iExecute.js";
import type { IManageCommandQueue } from "./commandQueueManager.js";
import type { IEventAggregator } from "../events/iEventAggregator.js";
import { CommandExecutedEvent } from "../events/commandExecutedEvent.js";
import { CommandFailedException } from "./commandFailedException.js";
import { ProgressMessageContext } from "./progressMessageContext.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandExecutor.cs.
 *
 * ## `IServiceFactory.Build(typeof(IExecute<TCommand>))` and the
 *    `THREAD_LIMIT` worker pool
 *
 * C# resolves the single registered `IExecute<TCommand>` handler for a
 * given command's *runtime* type via the DI container at dispatch time
 * (`(dynamic)command.Body` -- a dynamic dispatch trick so the right
 * generic `IExecute<TCommand>` overload gets resolved for whatever
 * concrete `Command` subclass is in the queue). Per this port's
 * explicit-over-reflection convention, that becomes an explicit
 * `executorRegistry` map from command name -> `IExecute<Command>`,
 * populated by `registerExecutor` (the direct parallel of
 * `commandQueueManager.ts`'s `registerCommandType` on the command-type
 * side, and `eventAggregator.ts`'s `subscribe` on the event side).
 *
 * `THREAD_LIMIT = 3`: C# starts 3 real OS threads, each independently
 * pulling from the same blocking `IManageCommandQueue.Queue(token)`
 * enumerable. Ported as 3 concurrent async consumer loops over
 * `commandQueueManager.queue(signal)` (an async generator -- see
 * `commandQueue.ts`'s doc comment on the blocking-wait adaptation)
 * kicked off by `handleApplicationStarted` and running until
 * `handleApplicationShutdownRequested` aborts the shared `AbortController`.
 * This preserves the actual concurrency-*shape* Readarr relies on (up to 3
 * commands genuinely in flight at once, each awaiting real I/O
 * independently) even though Node's single JS thread means their
 * synchronous portions never truly run in parallel -- the same
 * async-concurrency substitution this port uses throughout for
 * I/O-bound "parallel" work.
 *
 * `IHandle<ApplicationStartedEvent>`/`IHandle<ApplicationShutdownRequested>`:
 * `Lifecycle` is not a ported module anywhere in this repo yet (see
 * `commandQueueManager.ts`'s identical note on `handleApplicationStarted`)
 * -- ported as plain `handleApplicationStarted`/
 * `handleApplicationShutdownRequested` methods a future Lifecycle-event
 * subscriber can call.
 */
export type CommandHandler = IExecute<Command>;

export interface CommandExecutorOptions {
  /** Stand-in for NLog `Logger.Trace(...)`/`Logger.Error(...)` calls -- see config/configService.ts's doc comment for this port's established no-NLog-yet convention. */
  onTrace?: (message: string) => void;
  onError?: (message: string, error: unknown) => void;
  /** Number of concurrent consumer loops -- see class doc comment on THREAD_LIMIT. Defaults to the C# original's hardcoded 3. */
  concurrency?: number;
}

export class CommandExecutor {
  private readonly executorRegistry = new Map<string, CommandHandler>();
  private readonly onTrace?: (message: string) => void;
  private readonly onError?: (message: string, error: unknown) => void;
  private readonly concurrency: number;

  private abortController: AbortController | null = null;
  private workers: Promise<void>[] = [];

  constructor(
    private readonly commandQueueManager: IManageCommandQueue,
    private readonly eventAggregator: IEventAggregator,
    options: CommandExecutorOptions = {}
  ) {
    this.onTrace = options.onTrace;
    this.onError = options.onError;
    this.concurrency = options.concurrency ?? 3;
  }

  /** Explicit-registration replacement for `IServiceFactory.Build(typeof(IExecute<TCommand>))` -- see class doc comment. Register one handler per concrete command name. */
  registerExecutor(commandName: string, handler: CommandHandler): void {
    this.executorRegistry.set(commandName, handler);
  }

  /** Ported from `Handle(ApplicationStartedEvent message)`: starts THREAD_LIMIT (here: `concurrency`) consumer loops. See class doc comment. */
  handleApplicationStarted(): void {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      this.workers.push(this.executeCommands(signal));
    }
  }

  /** Ported from `Handle(ApplicationShutdownRequested message)`. */
  handleApplicationShutdownRequested(): void {
    this.onTrace?.("Shutting down task execution");
    this.abortController?.abort();
  }

  /** Waits for all worker loops to finish -- not present in the C# source (`Thread.Start()` is fire-and-forget there), added since Node has no equivalent of just walking away from a spawned OS thread cleanly; primarily useful for tests that need deterministic shutdown. */
  async waitForShutdown(): Promise<void> {
    await Promise.all(this.workers);
  }

  private async executeCommands(signal: AbortSignal): Promise<void> {
    try {
      for await (const command of this.commandQueueManager.queue(signal)) {
        try {
          await this.executeCommand(command.body, command);
        } catch (e) {
          this.onError?.(`Error occurred while executing task ${command.name}`, e);
        }
      }
    } catch (e) {
      this.onError?.("Unknown error in thread", e);
    }
  }

  private async executeCommand(command: Command, commandModel: CommandModel): Promise<void> {
    const handler = this.executorRegistry.get(command.name);

    if (!handler) {
      // Ported from C#'s `_serviceFactory.Build(typeof(IExecute<TCommand>))`
      // throwing when no handler is registered for the command's runtime
      // type -- surfaced the same way a failed command would be (caught by
      // the outer executeCommands try/catch, logged, loop continues).
      throw new Error(`No IExecute handler registered for command "${command.name}"`);
    }

    this.onTrace?.(`${command.name} -> ${handler.constructor.name}`);

    try {
      this.commandQueueManager.start(commandModel);
      this.broadcastCommandUpdate(commandModel);

      if (ProgressMessageContext.commandModel === null) {
        ProgressMessageContext.commandModel = commandModel;
      }

      await handler.execute(command);

      this.commandQueueManager.complete(
        commandModel,
        command.completionMessage ?? commandModel.message
      );
    } catch (e) {
      if (e instanceof CommandFailedException) {
        this.commandQueueManager.setMessage(commandModel, "Failed");
        this.commandQueueManager.fail(commandModel, e.message, e);
        throw e;
      }

      this.commandQueueManager.setMessage(commandModel, "Failed");
      this.commandQueueManager.fail(commandModel, "Failed", e);
      throw e;
    } finally {
      this.broadcastCommandUpdate(commandModel);

      this.eventAggregator.publishEvent(new CommandExecutedEvent(commandModel));

      if (ProgressMessageContext.commandModel === commandModel) {
        ProgressMessageContext.commandModel = null;
      }

      this.onTrace?.(
        `${command.name} <- ${handler.constructor.name} [${String(commandModel.duration)}]`
      );
    }
  }

  private broadcastCommandUpdate(command: CommandModel): void {
    if (command.body.sendUpdatesToClient) {
      this.eventAggregator.publishEvent(new CommandUpdatedEvent(command));
    }
  }
}

/**
 * Ported from NzbDrone.SignalR/Broadcast/CommandUpdatedEvent (referenced by
 * `CommandExecutor.cs` as `NzbDrone.Core.Messaging.Events.
 * CommandUpdatedEvent` -- actually defined in a SignalR broadcast module,
 * not `NzbDrone.Core.Messaging`, and not in this worktree's scope). Ported
 * locally here as a minimal event carrying just the updated `CommandModel`,
 * matching the shape `CommandExecutor`'s own call site needs -- when the
 * real SignalR/broadcast module lands, this local definition can be
 * replaced with an import from there without changing `CommandExecutor`'s
 * logic.
 */
export class CommandUpdatedEvent {
  constructor(public readonly command: CommandModel) {}
}
