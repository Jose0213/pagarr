import type { Command } from "./command.js";
import type { CommandModel } from "./commandModel.js";
import { newCommandModel } from "./commandModel.js";
import { CommandQueue } from "./commandQueue.js";
import { CommandPriority } from "./commandPriority.js";
import { CommandStatus } from "./commandStatus.js";
import { CommandTrigger } from "./commandTrigger.js";
import { CommandResult } from "./commandResult.js";
import { CommandEqualityComparer } from "./commandEqualityComparer.js";
import { CommandNotFoundException } from "./commandNotFoundException.js";
import type { ICommandRepository } from "./commandRepository.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandQueueManager.cs.
 *
 * ## The `KnownTypes`/reflection problem and how this port adapts it
 *
 * C#'s `Push(string commandName, ...)` overload (used by the scheduler,
 * which stores commands by name string, not by live instance) resolves the
 * name back to a `Command` subclass via `KnownTypes.GetImplementations
 * (typeof(Command))` -- a reflection scan of every loaded assembly for
 * `Command` subclasses, matched case-insensitively by simple name, then
 * `Json.Deserialize("{}", commandType)` (deserializing an empty JSON object
 * constructs a default instance of that type).
 *
 * Per this port's explicit-over-reflection convention (see
 * `eventAggregator.ts`'s doc comment for the parallel adaptation on the
 * Events side), this is replaced with an explicit `commandTypeRegistry`
 * map from command name -> zero-arg factory function, populated by
 * `registerCommandType`. A caller (application wiring, once every real
 * command class across all modules is ported and available to import)
 * registers each concrete `Command` subclass once; `push(commandName, ...)`
 * looks it up in that map instead of scanning assemblies. Throws the same
 * `CommandNotFoundException` C#'s `.Single(...)` would throw (as an
 * `InvalidOperationException`) when the name doesn't match any registered
 * type -- ported as an explicit, named exception rather than relying on
 * LINQ's generic "sequence contains no matching element"/"more than one
 * matching element" messages, since this port has no LINQ to inherit that
 * message text from and a purpose-built exception is more useful here
 * regardless.
 *
 * `MessagingCleanupCommand`, `TestCommand`, and `UnknownCommand` (this
 * module's own three concrete commands) are pre-registered by
 * `createCommandQueueManager` below so the manager is usable out of the box
 * without every caller re-registering this module's own bootstrap commands.
 */
export type CommandFactory = () => Command;

/** Ported from `IManageCommandQueue`. */
export interface IManageCommandQueue {
  pushMany<TCommand extends Command>(commands: TCommand[]): CommandModel[];
  push<TCommand extends Command>(
    command: TCommand,
    priority?: CommandPriority,
    trigger?: CommandTrigger
  ): CommandModel;
  pushByName(
    commandName: string,
    lastExecutionTime: string | null,
    lastStartTime: string | null,
    priority?: CommandPriority,
    trigger?: CommandTrigger
  ): CommandModel;
  queue(signal?: AbortSignal): AsyncGenerator<CommandModel>;
  all(): CommandModel[];
  get(id: number): CommandModel | undefined;
  getStarted(): CommandModel[];
  setMessage(command: CommandModel, message: string): void;
  setResult(command: CommandModel, result: CommandResult): void;
  start(command: CommandModel): void;
  complete(command: CommandModel, message: string | null): void;
  fail(command: CommandModel, message: string, error: unknown): void;
  requeue(): void;
  cancel(id: number): void;
  cleanCommands(): void;
}

export interface CommandQueueManagerOptions {
  /** Stand-in for NLog `Logger.Trace(...)` calls throughout the C# source -- see config/configService.ts's doc comment for this port's established no-NLog-yet convention. */
  onTrace?: (message: string) => void;
}

export class CommandQueueManager implements IManageCommandQueue {
  private readonly commandQueue = new CommandQueue();
  private readonly commandTypeRegistry = new Map<string, CommandFactory>();
  private readonly onTrace?: (message: string) => void;

  constructor(
    private readonly repo: ICommandRepository,
    options: CommandQueueManagerOptions = {}
  ) {
    this.onTrace = options.onTrace;
  }

  /**
   * Explicit-registration replacement for `KnownTypes.GetImplementations
   * (typeof(Command))`'s reflection scan -- see class doc comment. Register
   * every concrete `Command` subclass a caller wants resolvable by name via
   * `pushByName`/`push(commandName, ...)` (the scheduler's own lookup
   * path).
   */
  registerCommandType(name: string, factory: CommandFactory): void {
    this.commandTypeRegistry.set(name.toLowerCase(), factory);
  }

  pushMany<TCommand extends Command>(commands: TCommand[]): CommandModel[] {
    this.onTrace?.(`Publishing ${commands.length} commands`);

    const commandModels: CommandModel[] = [];
    const existingCommands = this.commandQueue.queuedOrStarted();

    for (const command of commands) {
      const existing = existingCommands.find(
        (c) => c.name === command.name && CommandEqualityComparer.instance.equals(c.body, command)
      );

      if (existing) {
        continue;
      }

      commandModels.push(
        newCommandModel({
          body: command,
          trigger: CommandTrigger.Unspecified,
          priority: CommandPriority.Normal,
          status: CommandStatus.Queued,
        })
      );
    }

    const inserted = this.repo.insertMany(commandModels);

    for (const commandModel of inserted) {
      this.commandQueue.add(commandModel);
    }

    return inserted;
  }

  push<TCommand extends Command>(
    command: TCommand,
    priority: CommandPriority = CommandPriority.Normal,
    trigger: CommandTrigger = CommandTrigger.Unspecified
  ): CommandModel {
    if (command === null || command === undefined) {
      throw new Error("command must not be null");
    }

    this.onTrace?.(`Publishing ${command.name}`);
    this.onTrace?.(`Checking if command is queued or started: ${command.name}`);

    const existingCommands = this.queuedOrStartedByName(command.name);
    const existing = existingCommands.find((c) =>
      CommandEqualityComparer.instance.equals(c.body, command)
    );

    if (existing) {
      this.onTrace?.(`Command is already in progress: ${command.name}`);
      return existing;
    }

    const commandModel = newCommandModel({
      body: command,
      trigger,
      priority,
      status: CommandStatus.Queued,
    });

    this.onTrace?.(`Inserting new command: ${commandModel.name}`);

    const inserted = this.repo.insert(commandModel);
    this.commandQueue.add(inserted);

    return inserted;
  }

  /**
   * Ported from the C# `Push(string commandName, DateTime?
   * lastExecutionTime, DateTime? lastStartTime, ...)` overload -- named
   * `pushByName` here (TS has no overload-by-parameter-type dispatch on a
   * single method name usable the way the C# source distinguishes this
   * from the generic `Push<TCommand>`).
   */
  pushByName(
    commandName: string,
    lastExecutionTime: string | null,
    lastStartTime: string | null,
    priority: CommandPriority = CommandPriority.Normal,
    trigger: CommandTrigger = CommandTrigger.Unspecified
  ): CommandModel {
    const command = this.getCommand(commandName);
    command.lastExecutionTime = lastExecutionTime;
    command.lastStartTime = lastStartTime;
    command.trigger = trigger;

    return this.push(command, priority, trigger);
  }

  queue(signal?: AbortSignal): AsyncGenerator<CommandModel> {
    return this.commandQueue.getConsumingEnumerable(signal);
  }

  all(): CommandModel[] {
    this.onTrace?.("Getting all commands");
    return this.commandQueue.all();
  }

  get(id: number): CommandModel | undefined {
    return this.commandQueue.find(id) ?? this.repo.find(id);
  }

  getStarted(): CommandModel[] {
    this.onTrace?.("Getting started commands");
    return this.commandQueue.all().filter((c) => c.status === CommandStatus.Started);
  }

  setMessage(command: CommandModel, message: string): void {
    command.message = message;
  }

  setResult(command: CommandModel, result: CommandResult): void {
    command.result = result;
  }

  start(command: CommandModel): void {
    // Marks the command as started in the DB, the queue takes care of marking it as started on it's own
    this.onTrace?.(`Marking command as started: ${command.name}`);
    this.repo.start(command);
  }

  complete(command: CommandModel, message: string | null): void {
    // If the result hasn't been set yet then set it to successful
    if (command.result === CommandResult.Unknown) {
      command.result = CommandResult.Successful;
    }

    this.update(command, CommandStatus.Completed, message);

    this.commandQueue.pulseAllConsumers();
  }

  fail(command: CommandModel, message: string, error: unknown): void {
    command.exception = errorToString(error);

    this.update(command, CommandStatus.Failed, message);

    this.commandQueue.pulseAllConsumers();
  }

  requeue(): void {
    for (const command of this.repo.queued()) {
      this.commandQueue.add(command);
    }
  }

  cancel(id: number): void {
    if (!this.commandQueue.removeIfQueued(id)) {
      throw new Error("Unable to cancel task");
    }
  }

  cleanCommands(): void {
    this.onTrace?.("Cleaning up old commands");

    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const commands = this.commandQueue
      .all()
      .filter((c) => c.endedAt !== null && c.endedAt < cutoff);

    this.commandQueue.removeMany(commands);

    this.repo.trim();
  }

  private getCommand(commandName: string): Command {
    const parts = commandName.split(".");
    const shortName = parts[parts.length - 1] ?? commandName;
    const factory = this.commandTypeRegistry.get(shortName.toLowerCase());

    if (!factory) {
      throw new CommandNotFoundException(commandName);
    }

    return factory();
  }

  private update(command: CommandModel, status: CommandStatus, message: string | null): void {
    this.setMessage(command, message ?? "");

    command.endedAt = new Date().toISOString();
    command.duration = command.startedAt
      ? new Date(command.endedAt).getTime() - new Date(command.startedAt).getTime()
      : null;
    command.status = status;

    this.onTrace?.("Updating command status");
    this.repo.end(command);
  }

  private queuedOrStartedByName(name: string): CommandModel[] {
    return this.commandQueue.queuedOrStarted().filter((q) => q.name === name);
  }

  /** Ported from `Handle(ApplicationStartedEvent message)`. `ApplicationStartedEvent` is `Lifecycle` module -- not ported anywhere in this repo yet (see `qualities/qualityDefinitionService.ts`'s identical deviation note) -- so this is exposed as a plain method a future Lifecycle-event subscriber can call, rather than a real `IHandle<ApplicationStartedEvent>` implementation. */
  handleApplicationStarted(): void {
    this.onTrace?.("Orphaning incomplete commands");
    this.repo.orphanStarted();
    this.requeue();
  }
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}
