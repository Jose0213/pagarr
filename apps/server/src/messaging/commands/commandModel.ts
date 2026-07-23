import type { ModelBase } from "../../db/model-base.js";
import type { Command } from "./command.js";
import { CommandPriority } from "./commandPriority.js";
import { CommandStatus } from "./commandStatus.js";
import { CommandResult } from "./commandResult.js";
import { CommandTrigger } from "./commandTrigger.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandModel.cs.
 *
 * C#: `CommandModel : ModelBase, IMessage`. `IMessage` (NzbDrone.Common.
 * Messaging) is another pure marker interface (same role as `IEvent`) with
 * no members -- not ported as a real interface here since nothing in this
 * module's scope reads it structurally (TS's structural typing makes a
 * dedicated empty marker unnecessary; see `iEvent.ts`'s doc comment for the
 * general pattern this port uses when a marker *is* needed elsewhere).
 *
 * `Duration` is C#'s `TimeSpan?` -- ported as milliseconds (`number |
 * null`), matching this port's established convention for `TimeSpan?`
 * fields elsewhere (e.g. `DownloadClientItem.remainingTime`, see
 * `download-clients/DownloadClientItem.ts`). `QueuedAt`/`StartedAt`/
 * `EndedAt` are C#'s `DateTime`/`DateTime?` -- ported as ISO 8601 strings
 * (`string`/`string | null`), matching this port's established date
 * convention (see e.g. `entityHistory.ts`'s `EntityHistoryRecord.date` doc
 * comment).
 */
export interface CommandModel extends ModelBase {
  name: string;
  body: Command;
  priority: CommandPriority;
  status: CommandStatus;
  result: CommandResult;
  /** ISO 8601 string. */
  queuedAt: string;
  /** ISO 8601 string, or null before the command starts. */
  startedAt: string | null;
  /** ISO 8601 string, or null before the command ends. */
  endedAt: string | null;
  /** Milliseconds, or null before the command ends. See module doc comment on the `TimeSpan?` convention. */
  duration: number | null;
  exception: string | null;
  trigger: CommandTrigger;
  message: string | null;
}

/**
 * Ported from `CommandModel`'s implicit default field values (C# defaults:
 * 0/null/enum-default-0 for unset properties on a freshly `new`'d
 * instance) -- not a real C# factory method (the source has none; commands
 * are built with object initializers at each call site), but this port's
 * established convention for "the parameterless-`new`-equivalent" wherever
 * a plain data interface needs one (see e.g. `books/models.ts`'s
 * `newBook`/`newAuthor`).
 */
export function newCommandModel(
  overrides: Partial<CommandModel> & { body: Command }
): CommandModel {
  return {
    id: 0,
    name: overrides.body.name,
    priority: CommandPriority.Normal,
    status: CommandStatus.Queued,
    result: CommandResult.Unknown,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
    duration: null,
    exception: null,
    trigger: CommandTrigger.Unspecified,
    message: null,
    ...overrides,
  };
}
