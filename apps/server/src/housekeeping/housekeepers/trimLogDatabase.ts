import type { LogRepository } from "../../instrumentation/logRepository.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/TrimLogDatabase.cs.
 *
 * Thin delegate to `ILogRepository.Trim()` (already ported -- see
 * `instrumentation/logRepository.ts`'s `trim()`, itself the real port of
 * `LogRepository.Trim()`: deletes every log row at/before 7 days ago and
 * VACUUMs the log database).
 */
export class TrimLogDatabase implements IHousekeepingTask {
  constructor(private readonly logRepo: Pick<LogRepository, "trim">) {}

  clean(): void {
    this.logRepo.trim();
  }
}
