import type { ModelBase } from "../db/model-base.js";
import { CommandPriority } from "./CommandPriority.js";

/**
 * Ported from NzbDrone.Core/Jobs/ScheduledTask.cs.
 *
 * `typeName` mirrors C#'s `TypeName` (a `Type.FullName` string identifying
 * which Command class this scheduled task runs) -- this port has no
 * runtime `Type`/reflection, so `typeName` is just an opaque string
 * identifier a caller assigns consistently (matching how `ProviderFactory
 * .ts`'s `implementation` field is also just a plain string key rather than
 * a reflected type name -- see that module's "explicit over reflection"
 * doc comments for the same substitution pattern).
 */
export interface ScheduledTask extends ModelBase {
  typeName: string;
  interval: number;
  lastExecution: string;
  priority: CommandPriority;
  lastStartTime: string;
}

/** Ported from ScheduledTask's ctor: `Priority = CommandPriority.Low`. */
export function createScheduledTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 0,
    typeName: "",
    interval: 0,
    lastExecution: new Date(0).toISOString(),
    priority: CommandPriority.Low,
    lastStartTime: new Date(0).toISOString(),
    ...overrides,
  };
}
