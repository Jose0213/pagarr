import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IDatabase } from "../db/database.js";
import type { IEventAggregator } from "../db/events.js";
import { CommandPriority } from "./CommandPriority.js";
import { createScheduledTask, type ScheduledTask } from "./ScheduledTask.js";

/**
 * Ported from NzbDrone.Core/Jobs/ScheduledTaskRepository.cs.
 *
 * DEVIATION -- `priority` is NOT a persisted column: migration
 * 001_initial_setup.cs's `Create.TableForModel("ScheduledTasks")` only
 * declares TypeName/Interval/LastExecution/LastStartTime (verified against
 * the real migration source; this port's own
 * `db/migrations/0001_initial_setup.sql` "ScheduledTasks" table matches).
 * `ScheduledTask.Priority` is populated purely in-memory by `TaskManager`'s
 * default-task list every time it re-initializes (same non-persisted-field
 * shape as `IndexerDefinition.protocol`/`supportsRss`/`supportsSearch`, see
 * `indexers/IndexerRepository.ts`'s doc comment) -- this repository leaves
 * it at `createScheduledTask()`'s default (`CommandPriority.Low`) on read,
 * same as that sibling's documented pattern.
 */
const SCHEDULED_TASK_COLUMNS: ColumnMapping<ScheduledTask>[] = [
  { prop: "typeName", column: "TypeName" },
  { prop: "interval", column: "Interval" },
  { prop: "lastExecution", column: "LastExecution" },
  { prop: "lastStartTime", column: "LastStartTime" },
];

export interface IScheduledTaskRepository {
  all(): ScheduledTask[];
  find(id: number): ScheduledTask | undefined;
  get(id: number): ScheduledTask;
  insert(model: ScheduledTask): ScheduledTask;
  update(model: ScheduledTask): ScheduledTask;
  updateMany(models: ScheduledTask[]): void;
  upsert(model: ScheduledTask): ScheduledTask;
  delete(id: number): void;
  /** Ported from IScheduledTaskRepository.GetDefinition(Type type): Query(c => c.TypeName == type.FullName).Single(). */
  getDefinition(typeName: string): ScheduledTask;
  /** Ported from IScheduledTaskRepository.SetLastExecutionTime(). */
  setLastExecutionTime(id: number, executionTime: string, startTime: string): void;
}

export class ScheduledTaskRepository
  extends BasicRepository<ScheduledTask>
  implements IScheduledTaskRepository
{
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, {
      tableName: "ScheduledTasks",
      columns: SCHEDULED_TASK_COLUMNS,
      eventAggregator,
    });
  }

  /** Row read via BasicRepository doesn't know about the non-persisted `priority` field -- defaults it, matching the C# in-memory-only shape documented above. */
  private withDefaultPriority(task: ScheduledTask): ScheduledTask {
    return { ...createScheduledTask(), ...task, priority: CommandPriority.Low };
  }

  override all(): ScheduledTask[] {
    return super.all().map((t) => this.withDefaultPriority(t));
  }

  override find(id: number): ScheduledTask | undefined {
    const found = super.find(id);
    return found ? this.withDefaultPriority(found) : undefined;
  }

  getDefinition(typeName: string): ScheduledTask {
    const matches = this.all().filter((c) => c.typeName === typeName);
    if (matches.length !== 1) {
      throw new Error(
        `Sequence contains ${matches.length} elements matching "${typeName}", expected exactly one`
      );
    }
    return matches[0]!;
  }

  setLastExecutionTime(id: number, executionTime: string, startTime: string): void {
    this.setFields(
      { ...createScheduledTask(), id, lastExecution: executionTime, lastStartTime: startTime },
      ["lastExecution", "lastStartTime"]
    );
  }
}
