import type { IDatabase } from "../../db/database.js";
import { BasicRepository, type ColumnMapping } from "../../db/basic-repository.js";
import {
  NullEventAggregator,
  type IEventAggregator as IDbEventAggregator,
} from "../../db/events.js";
import type { Command } from "./command.js";
import type { CommandModel } from "./commandModel.js";
import { CommandStatus } from "./commandStatus.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandRepository.cs.
 *
 * Row-shape deviation (same pattern as root-folders/root-folder-repository.ts's
 * doc comment): C#'s Dapper-based `BasicRepository<CommandModel>` relies on
 * a registered `EmbeddedDocumentConverter` to transparently (de)serialize
 * the polymorphic `Body` column (a `Command` subclass instance, written via
 * `PolymorphicWriteOnlyJsonConverter<Command>` -- see command.ts's doc
 * comment) to/from the `Commands.Body` TEXT column as JSON. Pagarr's
 * `BasicRepository<TModel>` has no JSON-column hook (out of this module's
 * scope to add -- see task constraints), so this repository is declared
 * against an internal `CommandRow` shape (`body: string`, the raw JSON
 * text) and converts to/from the real `CommandModel` domain shape
 * (`body: Command`) at the boundary, same as `RootFolderRepository`.
 *
 * `Body` deserialization here is intentionally shallow: `JSON.parse` alone
 * can't reconstruct a real `Command` subclass instance (it has no
 * constructor call, no `.name`/getters) the way C#'s polymorphic converter
 * reconstructs the exact original `Command` subclass from a type
 * discriminator. Round-tripping a `CommandRepository` row all the way back
 * to a live, correctly-typed `Command` instance requires a registry
 * mapping `Name` -> constructor -- exactly the `KnownTypes.GetImplementations
 * (typeof(Command))` reflection scan `CommandQueueManager.GetCommand`
 * performs in C# (see commandQueueManager.ts's doc comment on
 * `commandTypeRegistry`, the explicit-registration replacement for that
 * scan). `fromRow` below returns the parsed-JSON `Body` typed as
 * `Command` for interface-shape fidelity, but callers that need a fully
 * "live" reconstructed instance (able to call its getters, e.g.
 * `requiresDiskAccess`) should go through `CommandQueueManager`, which
 * owns that registry.
 */
interface CommandRow {
  id: number;
  name: string;
  body: string;
  priority: number;
  status: number;
  result: number;
  queuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /** Milliseconds, stored as a TEXT-encoded .NET `TimeSpan` string in the real DB -- see toRow/fromRow's `duration` conversion doc comment. */
  duration: string | null;
  exception: string | null;
  trigger: number;
}

const COMMAND_COLUMNS: ColumnMapping<CommandRow>[] = [
  { prop: "name", column: "Name" },
  { prop: "body", column: "Body" },
  { prop: "priority", column: "Priority" },
  { prop: "status", column: "Status" },
  { prop: "result", column: "Result" },
  { prop: "queuedAt", column: "QueuedAt" },
  { prop: "startedAt", column: "StartedAt" },
  { prop: "endedAt", column: "EndedAt" },
  { prop: "duration", column: "Duration" },
  { prop: "exception", column: "Exception" },
  { prop: "trigger", column: "Trigger" },
];

/**
 * Ported from Dapper's `TimeSpan` <-> TEXT column handling: C#'s
 * `TimeSpan.ToString()`/`TimeSpan.Parse` round-trip format
 * (`"hh:mm:ss.fffffff"`). This repository stores/reads `Duration` in that
 * same textual form so the column stays human-readable and compatible with
 * what a real Readarr DB file would contain, converting to/from this
 * port's plain-milliseconds `CommandModel.duration` at the boundary.
 */
function durationToRow(ms: number | null): string | null {
  if (ms === null) {
    return null;
  }
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsStr = seconds.toFixed(7).padStart(10, "0");
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secondsStr}`;
}

function durationFromRow(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) {
    return null;
  }
  const [, hoursStr, minutesStr, secondsStr] = match as unknown as [string, string, string, string];
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const seconds = Number(secondsStr);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function toRow(model: CommandModel): CommandRow {
  return {
    id: model.id,
    name: model.name,
    body: JSON.stringify(model.body),
    priority: model.priority,
    status: model.status,
    result: model.result,
    queuedAt: model.queuedAt,
    startedAt: model.startedAt,
    endedAt: model.endedAt,
    duration: durationToRow(model.duration),
    exception: model.exception,
    trigger: model.trigger,
  };
}

/**
 * See this file's class doc comment: `body` here is parsed JSON, not a
 * reconstructed `Command` subclass instance. Callers needing a live
 * instance should go through `CommandQueueManager`.
 *
 * `message` is always `null` here: it has no backing DB column (migration
 * 0001's `Commands` table has no `Message` column, matching the C# source
 * -- `CommandModel.Message` is runtime-only progress-reporting state, set
 * via `SetMessage`/read by API consumers, and deliberately excluded from
 * `Start`/`End`'s `SetFields` persistence calls). A row freshly loaded from
 * the DB (e.g. after a restart, via `Requeue`/`OrphanStarted`) never has a
 * last-known message to restore, exactly like the C# original.
 */
function fromRow(row: CommandRow): CommandModel {
  return {
    id: row.id,
    name: row.name,
    body: JSON.parse(row.body) as Command,
    priority: row.priority,
    status: row.status,
    result: row.result,
    queuedAt: row.queuedAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    duration: durationFromRow(row.duration),
    exception: row.exception,
    trigger: row.trigger,
    message: null,
  };
}

export interface ICommandRepository {
  all(): CommandModel[];
  find(id: number): CommandModel | undefined;
  get(id: number): CommandModel;
  getMany(ids: number[]): CommandModel[];
  insert(model: CommandModel): CommandModel;
  insertMany(models: CommandModel[]): CommandModel[];
  update(model: CommandModel): CommandModel;
  delete(modelOrId: CommandModel | number): void;
  count(): number;
  hasItems(): boolean;
  trim(): void;
  orphanStarted(): void;
  queued(): CommandModel[];
  start(command: CommandModel): void;
  end(command: CommandModel): void;
}

export class CommandRepository implements ICommandRepository {
  private readonly inner: BasicRepository<CommandRow>;
  private readonly database: IDatabase;

  constructor(database: IDatabase, eventAggregator?: IDbEventAggregator) {
    this.database = database;
    this.inner = new BasicRepository<CommandRow>(database, {
      tableName: "Commands",
      columns: COMMAND_COLUMNS,
      eventAggregator: eventAggregator ?? new NullEventAggregator(),
    });
  }

  all(): CommandModel[] {
    return this.inner.all().map(fromRow);
  }

  find(id: number): CommandModel | undefined {
    const row = this.inner.find(id);
    return row ? fromRow(row) : undefined;
  }

  get(id: number): CommandModel {
    return fromRow(this.inner.get(id));
  }

  getMany(ids: number[]): CommandModel[] {
    return this.inner.getMany(ids).map(fromRow);
  }

  insert(model: CommandModel): CommandModel {
    return fromRow(this.inner.insert(toRow(model)));
  }

  insertMany(models: CommandModel[]): CommandModel[] {
    return this.inner.insertMany(models.map(toRow)).map(fromRow);
  }

  update(model: CommandModel): CommandModel {
    return fromRow(this.inner.update(toRow(model)));
  }

  delete(modelOrId: CommandModel | number): void {
    const id = typeof modelOrId === "number" ? modelOrId : modelOrId.id;
    this.inner.delete(id);
  }

  count(): number {
    return this.inner.count();
  }

  hasItems(): boolean {
    return this.inner.hasItems();
  }

  /** Ported from `CommandRepository.Trim()`: `Delete(c => c.EndedAt < DateTime.UtcNow.AddDays(-1))`. */
  trim(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    this.database
      .openConnection()
      .prepare('DELETE FROM "Commands" WHERE "EndedAt" IS NOT NULL AND "EndedAt" < ?')
      .run(cutoff);
  }

  /** Ported from `CommandRepository.OrphanStarted()`: a raw UPDATE, not routed through BasicRepository/events (matches the C# original doing the same raw SQL rather than a mapped Update). */
  orphanStarted(): void {
    this.database
      .openConnection()
      .prepare('UPDATE "Commands" SET "Status" = ?, "EndedAt" = ? WHERE "Status" = ?')
      .run(CommandStatus.Orphaned, new Date().toISOString(), CommandStatus.Started);
  }

  /** Ported from `CommandRepository.Queued()`: `Query(c => c.Status == CommandStatus.Queued)`. */
  queued(): CommandModel[] {
    return this.all().filter((c) => c.status === CommandStatus.Queued);
  }

  /** Ported from `CommandRepository.Start(CommandModel command)`: `SetFields(command, c => c.StartedAt, c => c.Status)`. */
  start(command: CommandModel): void {
    this.inner.setFields(toRow(command), ["startedAt", "status"]);
  }

  /** Ported from `CommandRepository.End(CommandModel command)`: `SetFields(command, c => c.EndedAt, c => c.Status, c => c.Duration, c => c.Exception)`. */
  end(command: CommandModel): void {
    this.inner.setFields(toRow(command), ["endedAt", "status", "duration", "exception"]);
  }
}
