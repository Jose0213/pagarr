import type { RestResource } from "../../rest/RestResource.js";
import type { Command } from "../../../messaging/commands/command.js";
import type { CommandModel } from "../../../messaging/commands/commandModel.js";
import { CommandPriority } from "../../../messaging/commands/commandPriority.js";
import { CommandStatus } from "../../../messaging/commands/commandStatus.js";
import { CommandResult } from "../../../messaging/commands/commandResult.js";
import { CommandTrigger } from "../../../messaging/commands/commandTrigger.js";
import { buildEnumWireNames, enumWireName } from "../../rest/enumWireName.js";

/**
 * Ported from Readarr.Api.V1/Commands/CommandResource.cs.
 *
 * `Priority`/`Status`/`Trigger` (all real, already-ported numeric enums --
 * see messaging/commands/) serialize as camelCase strings on the wire, same
 * as HealthResource.Type -- see enumWireName.ts's doc comment. `Result` is
 * ALSO a real enum (`CommandResult`) despite the field being typed
 * `CommandResult Result` in C# directly (not wrapped in a `CommandResultResource`
 * or similar) -- ported the same way.
 *
 * `Body` (C#'s live polymorphic `Command` instance, `[JsonConverter(typeof(PolymorphicWriteOnlyJsonConverter<Command>))]`
 * write-only) is ported as the same `Command` shape this port's
 * `messaging/commands/command.ts` already defines -- `express.json()`'s
 * `res.json()` will serialize its own getters (`sendUpdatesToClient`,
 * `updateScheduledTask`, etc.) as plain enumerable-on-the-instance
 * properties via `JSON.stringify`'s own handling of getters, matching
 * `PolymorphicWriteOnlyJsonConverter`'s "serialize every public property of
 * the concrete runtime type" behavior closely enough for this port's scope
 * (no custom `$type` discriminator is added -- nothing in this port's
 * scope deserializes a `CommandResource.Body` back into a live subclass
 * instance from the wire; `StartCommand`'s inbound body is parsed via the
 * name-keyed `commandTypeRegistry` instead, see CommandController.ts).
 *
 * `CompletionMessage` (`[JsonIgnore]` on the real resource -- runtime-only,
 * never serialized) is intentionally NOT part of this wire interface at
 * all, matching that attribute's effect exactly (the field literally isn't
 * present in the emitted JSON either way).
 *
 * `StateChangeTime`/`SendUpdatesToClient`/`UpdateScheduledTask` are C#
 * computed get-only properties (with a no-op setter purely so
 * System.Text.Json's default reflection-based writer doesn't skip them --
 * STJ requires a setter to consider a property "writable" for its
 * newer strict mode, though these three are read-only in practice) derived
 * from `Started`/`Ended`/`Body` at serialization time -- ported as plain
 * computed wire fields via `commandModelToResource` below rather than
 * getters on an interface (TS plain-object resources have no getters, per
 * this codebase's established "plain interface, not class" convention for
 * every other wire resource).
 */
export interface CommandResource extends RestResource {
  name: string;
  commandName: string;
  message: string | null;
  body: Command;
  priority: string;
  status: string;
  result: string;
  queued: string;
  started: string | null;
  ended: string | null;
  /** Milliseconds -- C#'s `TimeSpan?`, same convention as CommandModel.duration. */
  duration: number | null;
  exception: string | null;
  trigger: string;
  clientUserAgent: string | null;
  stateChangeTime: string | null;
  sendUpdatesToClient: boolean;
  updateScheduledTask: boolean;
  lastExecutionTime: string | null;
}

export const COMMAND_RESOURCE_NAME = "command";

const PRIORITY_NAMES = buildEnumWireNames(CommandPriority);
const STATUS_NAMES = buildEnumWireNames(CommandStatus);
const RESULT_NAMES = buildEnumWireNames(CommandResult);
const TRIGGER_NAMES = buildEnumWireNames(CommandTrigger);

/**
 * Ported from `UserAgentParser.SimplifyUserAgent(string userAgent)`: `null`
 * for a missing user agent OR one that starts with "Mozilla/5.0" (i.e.
 * "don't bother surfacing a generic browser UA string"), the raw value
 * otherwise.
 */
function simplifyUserAgent(userAgent: string | null): string | null {
  if (userAgent === null || userAgent.startsWith("Mozilla/5.0")) {
    return null;
  }
  return userAgent;
}

/**
 * Ported from `NzbDrone.Common.Extensions.StringExtensions.SplitCamelCase`:
 * inserts a space before every capital letter that isn't the first
 * character (`(?<!^)[A-Z]` -- a plain negative lookbehind, no named
 * capture groups, so it's exempt from this codebase's
 * duplicate-named-capture-group CI gotcha; see
 * apps/server/scripts/check-regex-compat.mjs).
 */
function splitCamelCase(input: string): string {
  return input.replace(/(?<!^)[A-Z]/g, (match) => " " + match);
}

/** Ported from `CommandResourceMapper.ToResource(this CommandModel model)`. */
export function commandModelToResource(model: CommandModel): CommandResource {
  return {
    id: model.id,
    name: model.name,
    commandName: splitCamelCase(model.name),
    message: model.message,
    body: model.body,
    priority: enumWireName(PRIORITY_NAMES, model.priority),
    status: enumWireName(STATUS_NAMES, model.status),
    result: enumWireName(RESULT_NAMES, model.result),
    queued: model.queuedAt,
    started: model.startedAt,
    ended: model.endedAt,
    duration: model.duration,
    exception: model.exception,
    trigger: enumWireName(TRIGGER_NAMES, model.trigger),

    clientUserAgent: simplifyUserAgent(model.body.clientUserAgent),

    // Ported from `StateChangeTime`: Started if set, else Ended.
    stateChangeTime: model.startedAt ?? model.endedAt,
    // Ported from `SendUpdatesToClient`/`UpdateScheduledTask`: read straight
    // off Body (false if Body is somehow null, matching the real getters'
    // own null guard -- Body is never actually null in this port's usage,
    // but the guard is preserved for fidelity).
    sendUpdatesToClient: model.body?.sendUpdatesToClient ?? false,
    updateScheduledTask: model.body?.updateScheduledTask ?? false,

    lastExecutionTime: model.body.lastExecutionTime,
  };
}

/** Ported from `CommandResourceMapper.ToResource(this IEnumerable<CommandModel> models)`. */
export function commandModelsToResource(models: CommandModel[]): CommandResource[] {
  return models.map(commandModelToResource);
}
