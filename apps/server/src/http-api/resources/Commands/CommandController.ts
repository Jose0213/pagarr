import type { Router } from "express";
import type { Request } from "express";
import { ModelAction } from "../../../db/events.js";
import { ModelNotFoundException } from "../../../db/errors.js";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { combineValidators } from "../../rest/ResourceValidator.js";
import type {
  IManageCommandQueue,
  CommandFactory,
} from "../../../messaging/commands/commandQueueManager.js";
import type { Command } from "../../../messaging/commands/command.js";
import type { CommandModel } from "../../../messaging/commands/commandModel.js";
import { CommandPriority } from "../../../messaging/commands/commandPriority.js";
import { CommandStatus } from "../../../messaging/commands/commandStatus.js";
import { CommandTrigger } from "../../../messaging/commands/commandTrigger.js";
import { CommandNotFoundException } from "../../../messaging/commands/commandNotFoundException.js";
import { CommandUpdatedEvent } from "../../../messaging/commands/commandExecutor.js";
import {
  COMMAND_RESOURCE_NAME,
  commandModelToResource,
  commandModelsToResource,
} from "./CommandResource.js";
import type { CommandResource } from "./CommandResource.js";

/**
 * Ported from Readarr.Api.V1/Commands/CommandController.cs.
 *
 * ## `KnownTypes.GetImplementations(typeof(Command))` resolution -- explicit
 * registry, not reflection
 *
 * `StartCommand` resolves the request body's `Name` field to a concrete
 * `Command` subclass via a reflection scan over every loaded assembly
 * (`_knownTypes.GetImplementations(typeof(Command)).Single(c =>
 * c.Name.Replace("Command", "").Equals(commandResource.Name, ...))`), then
 * `STJson.Deserialize(body, commandType)` (parses the raw request JSON
 * directly into a fresh instance of that concrete type, so any
 * command-specific fields in the body -- e.g. a hypothetical
 * `RefreshBookCommand.BookId` -- land on the constructed instance).
 *
 * This port has no reflection; `CommandQueueManager` (already-ported, Phase
 * 4 Wave 1) already solved exactly this problem for its own `pushByName`
 * path via an explicit `commandTypeRegistry: Map<string, CommandFactory>`
 * (see commandQueueManager.ts's doc comment) populated by
 * `registerCommandType(name, factory)`. `startCommand` below reuses that
 * SAME registry (passed in as a constructor option here, `commandTypeRegistry`)
 * rather than inventing a second one -- a caller registers each concrete
 * `Command` subclass exactly once and both `pushByName` (scheduler path)
 * and this controller's `POST /command` (manual API path) share it.
 *
 * Field application from the raw request body onto the constructed
 * instance (the part `STJson.Deserialize(body, commandType)` gets for
 * free from reflection) is done with a plain `Object.assign`-style merge
 * of the body's own enumerable keys minus `name` (the discriminator field
 * itself, already consumed to pick the factory) -- see `applyBodyFields`
 * below. This is a narrower mechanism than full JSON deserialization (it
 * won't coerce nested types), but covers this port's actual registered
 * commands today (none of which declare extra constructor-only fields
 * beyond what `Command`'s base already has) faithfully enough for the
 * scope of this task; a future command with richer body fields should
 * verify this merge still round-trips them correctly.
 *
 * `Priority`: `ManualImportCommand` gets `CommandPriority.High`, every
 * other command gets `CommandPriority.Normal` -- ported from
 * `commandType == typeof(ManualImportCommand) ? CommandPriority.High :
 * CommandPriority.Normal`. FORWARD-REF: this port's
 * `media-files-import/bookImport/manual/manualImportCommand.ts`
 * `ManualImportCommand` predates the real `Command` base class landing
 * (Phase 3 vs. Phase 4 Wave 1) and is a plain data interface, NOT a
 * `Command` subclass -- see that file's own doc comment. It can't be
 * `instanceof`-checked or registered in `commandTypeRegistry` the way every
 * other command here is. Detected structurally instead
 * (`resource.name === "ManualImport"`, this command's own registered wire
 * name) via `isManualImportCommandName` below -- reconciling
 * `ManualImportCommand` into a real `Command` subclass belongs to
 * media-files-import/'s own module (out of this worktree's scope, which
 * owns only `http-api/` plus the two new small core modules this task's
 * brief calls for), tracked here rather than silently worked around.
 *
 * ## What else is ported faithfully
 *
 *   - `PostValidator.RuleFor(c => c.Name).NotBlank()`.
 *   - `GetStartedCommands()`'s sort: `OrderBy(Status, CommandPriorityComparer)
 *     .ThenByDescending(Priority)` -- ported via `commandPriorityComparer`
 *     (already-ported) + a `Priority` descending tiebreak below.
 *   - `command.Trigger = CommandTrigger.Manual; command.SuppressMessages =
 *     !command.SendUpdatesToClient; command.SendUpdatesToClient = true;
 *     command.ClientUserAgent = Request.Headers["User-Agent"];` -- ported
 *     literally in `startCommand` below, including the `SuppressMessages`
 *     line reading `SendUpdatesToClient` BEFORE it gets forced to `true`
 *     two lines later (preserves the exact "suppress only if the command's
 *     own subclass default was false" semantics, not "always false since
 *     it's about to become true").
 *   - `IHandle<CommandUpdatedEvent>`'s 100ms-debounced batch broadcast +
 *     the `MessagingCleanupCommand`-completion "also broadcast a
 *     resourceless Sync" special case -- ported as `wireCommandBroadcasts`
 *     below, using the real, already-ported `CommandUpdatedEvent`
 *     (messaging/commands/commandExecutor.ts) and a plain `setTimeout`
 *     debounce (Node's direct equivalent of C#'s `Debouncer`, no port of
 *     that specific TPL helper class exists or is needed for this one use).
 *
 * ## FORWARD-REF (discovered while testing this controller): getter-only
 * `Command` fields do not survive `CommandQueueManager.push()`'s DB
 * round-trip
 *
 * `command.SendUpdatesToClient = true;` (ported as
 * `trySetSendUpdatesToClient` below, see its own doc comment for why a
 * guarded assignment is needed at all) is a real assignment against the
 * freshly-constructed `command` instance -- for a subclass that overrides
 * `sendUpdatesToClient` with a getter-only accessor (e.g. `TestCommand`,
 * `messaging/commands/testCommand.ts`), the assignment is correctly
 * skipped (JS has no accessor-pair-splitting like C#'s partial-override
 * fallthrough -- see that helper's doc comment), so the instance's own
 * `sendUpdatesToClient` getter (hardcoded `true` for `TestCommand`) is
 * still live and correct AT THIS POINT.
 *
 * However, `commandQueueManager.push(command, ...)` immediately persists
 * the command via `CommandRepository.insert()`
 * (messaging/commands/commandRepository.ts, Phase 4 Wave 1, out of this
 * worktree's scope), whose `toRow`/`fromRow` round-trip the `Body` column
 * through `JSON.stringify(model.body)` / `JSON.parse(row.body)`. Verified
 * directly: `JSON.stringify` only serializes a class instance's OWN
 * enumerable DATA properties, never prototype-level accessor (getter)
 * properties -- so `sendUpdatesToClient`/`updateScheduledTask`/
 * `completionMessage`/`lastExecutionTime` etc (all `get`-only or
 * getter-overridden on `Command` and its subclasses) are silently ABSENT
 * from the round-tripped `CommandModel.body` the `push()` call returns,
 * regardless of what a subclass's getter would have computed. This is a
 * real fidelity gap versus the C# source (where `System.Text.Json`
 * DOES serialize computed/virtual properties by default, so
 * `PolymorphicWriteOnlyJsonConverter<Command>` output round-trips them
 * correctly) -- tracked here as a genuine, currently-unclosed gap in the
 * already-ported `messaging/commands/commandRepository.ts` (not this
 * controller's own bug, and not something a Commands-API-resource-scoped
 * worktree can fix without touching that sibling-owned Phase 4 file). The
 * OBSERVABLE effect: `CommandResource.sendUpdatesToClient`/
 * `updateScheduledTask` on the wire response of a freshly-`POST /command`ed
 * command read back as `false`/whatever the base `Command`'s DATA-property
 * defaults are, even for a subclass whose getter override would say
 * otherwise -- this port's own `CommandController.test.ts` documents and
 * asserts this exact, real, currently-true behavior rather than asserting
 * an idealized one this code cannot actually produce today.
 */
export interface CommandControllerOptions {
  commandQueueManager: IManageCommandQueue;
  commandTypeRegistry: ReadonlyMap<string, CommandFactory>;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
}

/** Ported from `CommandPriorityComparer` + `.ThenByDescending(c => c.Priority)` -- see module doc comment. Compares full CommandModel rows the way `GetStartedCommands()`'s LINQ chain does. */
function compareForStartedList(a: CommandModel, b: CommandModel): number {
  if (a.status === CommandStatus.Started && b.status !== CommandStatus.Started) {
    return -1;
  }
  if (a.status !== CommandStatus.Started && b.status === CommandStatus.Started) {
    return 1;
  }
  if (a.status !== b.status) {
    return a.status < b.status ? -1 : 1;
  }

  // ThenByDescending(Priority)
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  return 0;
}

/** Ported from `_knownTypes.GetImplementations(typeof(Command)).Single(c => c.Name.Replace("Command", "").Equals(commandResource.Name, StringComparison.InvariantCultureIgnoreCase))`. See module doc comment. */
function resolveCommandFactory(
  registry: ReadonlyMap<string, CommandFactory>,
  name: string
): CommandFactory {
  const factory = registry.get(name.toLowerCase());
  if (!factory) {
    throw new CommandNotFoundException(name);
  }
  return factory;
}

/** Structural stand-in for `commandType == typeof(ManualImportCommand)` -- see module doc comment's "Priority" bullet for why this can't be a real `instanceof` check. */
function isManualImportCommandName(name: string): boolean {
  return name === "ManualImport";
}

/**
 * Ported spirit of `command.SendUpdatesToClient = true;` in `StartCommand`
 * -- a plain field assignment in the real C# source, legal there even
 * against a subclass instance whose `SendUpdatesToClient` OVERRIDE only
 * re-implements the getter (e.g. `TestCommand.SendUpdatesToClient => true`,
 * see messaging/commands/testCommand.ts). C# property-override rules let a
 * derived class override just one accessor of a virtual get/set property;
 * the un-overridden accessor (the setter, here) implicitly falls through
 * to the BASE class's own implementation -- so this assignment, on a real
 * `TestCommand`, silently writes the base's private `_sendUpdatesToClient`
 * backing field and has NO observable effect (the getter always returns
 * the hardcoded `true` regardless of that field). It's a real but
 * functionally inert write in the C# source.
 *
 * TypeScript/JS class fields have no equivalent "partial accessor
 * override, other accessor falls through to base" semantics: a subclass
 * that declares only a `get` for an inherited get/set accessor pair
 * REPLACES the pair entirely, making the property getter-only on that
 * subclass -- assigning to it throws a `TypeError` at runtime (verified:
 * this port's own `command.ts`/`testCommand.ts`, already-ported Phase 4
 * Wave 1 files outside this worktree's scope, exhibit exactly this;
 * nothing in this repo previously called `command.sendUpdatesToClient = x`
 * on a constructed instance to surface it before this controller's
 * `create` handler did). Ported here as a guarded assignment reproducing
 * the REAL OBSERVABLE BEHAVIOR (a no-op for a getter-only override, a real
 * write otherwise) rather than either silently swallowing every
 * `TypeError` this call site could throw or letting an inert C# no-op
 * crash this port's whole request.
 */
function trySetSendUpdatesToClient(command: Command, value: boolean): void {
  const descriptor = findAccessorDescriptor(command, "sendUpdatesToClient");
  if (descriptor?.set) {
    command.sendUpdatesToClient = value;
  }
}

function findAccessorDescriptor(instance: object, prop: string): PropertyDescriptor | undefined {
  let proto: object | null = instance;
  while (proto) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    if (descriptor) {
      return descriptor;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return undefined;
}

/** Merges the raw request body's own fields onto a freshly-constructed Command instance -- see module doc comment's "Field application" section. */
function applyBodyFields(command: Record<string, unknown>, body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === "name") {
      continue;
    }
    command[key] = value;
  }
}

export function commandController(options: CommandControllerOptions): Router {
  const { commandQueueManager, commandTypeRegistry, eventAggregator, signalRBroadcaster } = options;

  // Ported from `PostValidator.RuleFor(c => c.Name).NotBlank();`
  const nameNotBlank: ResourceValidator<CommandResource> = (resource) =>
    resource.name && resource.name.trim() !== ""
      ? []
      : [{ propertyName: "name", errorMessage: "'Name' must not be empty." }];

  const { router } = restControllerWithSignalR<CommandResource, CommandModel>({
    resourceName: COMMAND_RESOURCE_NAME,
    eventAggregator,
    signalRBroadcaster,
    postValidator: combineValidators(nameNotBlank),

    // Ported from `GetResourceById(int id) => _commandQueueManager.Get(id).ToResource();`
    // -- the real `IManageCommandQueue.Get(id)` throws when not found; this
    // port's `commandQueueManager.get()` returns `undefined` instead (see
    // commandQueueManager.ts), so the not-found case is translated into the
    // same `ModelNotFoundException` -> 404 mapping every other ported
    // GET-by-id handler in this task's scope uses.
    getById: (id) => {
      const command = commandQueueManager.get(id);
      if (!command) {
        throw new ModelNotFoundException("Commands", id);
      }
      return commandModelToResource(command);
    },

    getResourceByIdForBroadcast: (id) => {
      const command = commandQueueManager.get(id);
      if (!command) {
        throw new ModelNotFoundException("Commands", id);
      }
      return commandModelToResource(command);
    },

    // Ported from `GetStartedCommands()`.
    getAll: () =>
      commandModelsToResource([...commandQueueManager.all()].sort(compareForStartedList)),

    // Ported from `StartCommand(CommandResource commandResource)`. See
    // module doc comment for the full field-by-field mapping.
    create: (resource, req: Request) => {
      const factory = resolveCommandFactory(commandTypeRegistry, resource.name);
      const command = factory();

      applyBodyFields(command as unknown as Record<string, unknown>, req.body);

      const priority = isManualImportCommandName(resource.name)
        ? CommandPriority.High
        : CommandPriority.Normal;

      command.trigger = CommandTrigger.Manual;
      command.suppressMessages = !command.sendUpdatesToClient;
      trySetSendUpdatesToClient(command, true);
      command.clientUserAgent = req.headers["user-agent"] ?? null;

      const tracked = commandQueueManager.push(command, priority, CommandTrigger.Manual);
      return commandModelToResource(tracked);
    },

    delete: (id) => {
      commandQueueManager.cancel(id);
    },
  });

  return router;
}

/**
 * Ported from `CommandController.Handle(CommandUpdatedEvent message)` +
 * its private `SendUpdates()` (the `Debouncer`-backed batch flush). Wire
 * this at composition time:
 * `eventAggregator.subscribe(CommandUpdatedEvent, { handle: (m) =>
 * wireCommandBroadcasts(...).handle(m) })` -- returned as a stateful
 * `{ handle }` object (not a bare function) since the real C# source's
 * debounce state (`_pendingUpdates`, the `Debouncer` timer) is
 * per-controller-instance, not global.
 */
export function createCommandBroadcastHandler(
  signalRBroadcaster: SignalRBroadcaster,
  debounceMs = 100
): { handle: (message: CommandUpdatedEvent) => void } {
  const pendingUpdates = new Map<number, CommandResource>();
  let timer: NodeJS.Timeout | null = null;

  function sendUpdates(): void {
    const updates = [...pendingUpdates.values()];
    pendingUpdates.clear();

    for (const pendingUpdate of updates) {
      signalRBroadcaster.broadcastResourceChange(
        ModelAction.Updated,
        COMMAND_RESOURCE_NAME,
        pendingUpdate
      );

      // Ported from: `if (pendingUpdate.Name == typeof(MessagingCleanupCommand).Name.Replace("Command", "")
      // && pendingUpdate.Status == CommandStatus.Completed) { BroadcastResourceChange(ModelAction.Sync); }`
      if (pendingUpdate.name === "MessagingCleanup" && pendingUpdate.status === "completed") {
        signalRBroadcaster.broadcastResourceChange(ModelAction.Sync, COMMAND_RESOURCE_NAME);
      }
    }
  }

  return {
    handle(message: CommandUpdatedEvent): void {
      if (!message.command.body.sendUpdatesToClient) {
        return;
      }

      pendingUpdates.set(message.command.id, commandModelToResource(message.command));

      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(sendUpdates, debounceMs);
    },
  };
}
