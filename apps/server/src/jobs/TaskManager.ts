import { CommandPriority } from "./CommandPriority.js";
import { createScheduledTask, type ScheduledTask } from "./ScheduledTask.js";
import type { IScheduledTaskRepository } from "./ScheduledTaskRepository.js";

/** Minimal logger surface TaskManager needs. */
export interface TaskManagerLogger {
  trace(message: string, ...args: unknown[]): void;
}

const noopLogger: TaskManagerLogger = { trace: () => {} };

/**
 * Minimal config surface TaskManager needs -- the real `IConfigService`
 * (config/configService.ts) already exposes both of these under the exact
 * same names/semantics documented in that module.
 */
export interface TaskManagerConfig {
  readonly backupInterval: number;
  readonly rssSyncInterval: number;
}

/**
 * Ported from NzbDrone.Core/Jobs/TaskManager.cs's `Handle(ApplicationStartedEvent)`
 * default-task seed list.
 *
 * FORWARD-REFERENCE: the real C# list hardcodes `typeof(X).FullName` for
 * ten concrete Command classes spanning SEVEN not-yet-ported modules
 * (Download.RefreshMonitoredDownloadsCommand, Messaging.
 * MessagingCleanupCommand, Update.ApplicationUpdateCheckCommand,
 * HealthCheck.CheckHealthCommand, Books.RefreshAuthorCommand,
 * MediaFiles.RescanFoldersCommand, Housekeeping.HousekeepingCommand,
 * Backup.BackupCommand, ImportLists.ImportListSyncCommand, and this
 * worktree's own already-ported `RssSyncCommand` from Indexers). Per this
 * task's "explicit over reflection" instruction and the directory-scoping
 * constraint (Jobs may not reach into those unported modules' internals),
 * this list is expressed as plain string `typeName` identifiers matching
 * each Command class's real C# full name -- the same opaque-string
 * substitution `ScheduledTask.typeName`'s own doc comment describes. A
 * caller wiring this module up for real once those Command classes exist
 * imports each one's actual (still-to-be-decided) TS type-name constant
 * and constructs this list with real values instead of a caller-supplied
 * override; `defaultTaskDescriptors()` below takes the two config-derived
 * intervals as parameters so this module itself needs no config-service
 * import cycle.
 *
 * `RssSyncCommand.typeName` uses the string `"RssSyncCommand"` to match
 * this worktree's own already-merged `indexers/RssSyncCommand.ts` (the one
 * piece of this list NOT a forward-reference).
 */
export function defaultTaskDescriptors(
  backupInterval: number,
  rssSyncInterval: number
): ScheduledTask[] {
  return [
    createScheduledTask({
      interval: 1,
      typeName: "NzbDrone.Core.Download.RefreshMonitoredDownloadsCommand",
      priority: CommandPriority.High,
    }),
    createScheduledTask({
      interval: 5,
      typeName: "NzbDrone.Core.Messaging.MessagingCleanupCommand",
    }),
    createScheduledTask({
      interval: 6 * 60,
      typeName: "NzbDrone.Core.Update.Commands.ApplicationUpdateCheckCommand",
    }),
    createScheduledTask({
      interval: 6 * 60,
      typeName: "NzbDrone.Core.HealthCheck.CheckHealthCommand",
    }),
    createScheduledTask({
      interval: 24 * 60,
      typeName: "NzbDrone.Core.Books.Commands.RefreshAuthorCommand",
    }),
    createScheduledTask({
      interval: 24 * 60,
      typeName: "NzbDrone.Core.MediaFiles.Commands.RescanFoldersCommand",
    }),
    createScheduledTask({
      interval: 24 * 60,
      typeName: "NzbDrone.Core.Housekeeping.HousekeepingCommand",
    }),
    createScheduledTask({
      interval: backupInterval,
      typeName: "NzbDrone.Core.Backup.BackupCommand",
    }),
    createScheduledTask({
      interval: 5,
      typeName: "NzbDrone.Core.ImportLists.ImportListSyncCommand",
    }),
    createScheduledTask({
      interval: rssSyncInterval,
      typeName: "RssSyncCommand",
    }),
  ];
}

/** Ported from TaskManager.GetBackupInterval(): clamps to a minimum of 1 day, converts days to minutes. */
export function calculateBackupIntervalMinutes(configuredDays: number): number {
  const interval = configuredDays < 1 ? 1 : configuredDays;
  return interval * 60 * 24;
}

/** Ported from TaskManager.GetRssSyncInterval(): clamps 1-9 up to 10, negative down to 0 (disabled), 0/10+ unchanged. */
export function calculateRssSyncIntervalMinutes(configuredMinutes: number): number {
  if (configuredMinutes > 0 && configuredMinutes < 10) {
    return 10;
  }

  if (configuredMinutes < 0) {
    return 0;
  }

  return configuredMinutes;
}

/**
 * Ported from NzbDrone.Core/Jobs/TaskManager.cs's `ITaskManager` interface.
 */
export interface ITaskManager {
  getPending(): ScheduledTask[];
  getAll(): ScheduledTask[];
  getNextExecution(typeName: string): string;
}

/**
 * Ported from NzbDrone.Core/Jobs/TaskManager.cs.
 *
 * `Handle(ApplicationStartedEvent)`/`Handle(CommandExecutedEvent)`/
 * `HandleAsync(ConfigSavedEvent)` (the C# event-handler wiring) are ported
 * as plain public methods (`initialize()`/`onCommandExecuted()`/
 * `onConfigSaved()`) a caller invokes directly rather than event-bus
 * subscriptions -- matching every other module in this worktree's
 * "define the seam, wire the real bus later" pattern (see
 * `thingi-provider/status/ProviderStatusServiceBase.ts`'s
 * `handleProviderDeleted()` for the identical shape).
 *
 * `ICacheManager.GetCache<ScheduledTask>(GetType())` is replaced with a
 * plain `Map<string, ScheduledTask>` keyed by `typeName`, matching this
 * repo's established "replace ICacheManager/ICached with a plain Map"
 * convention (see `qualities/qualityDefinitionService.ts`'s doc comment).
 */
export class TaskManager implements ITaskManager {
  private readonly cache = new Map<string, ScheduledTask>();

  constructor(
    private readonly scheduledTaskRepository: IScheduledTaskRepository,
    private readonly configService: TaskManagerConfig,
    private readonly logger: TaskManagerLogger = noopLogger
  ) {}

  getPending(): ScheduledTask[] {
    const now = Date.now();
    return [...this.cache.values()].filter((c) => {
      if (c.interval <= 0) {
        return false;
      }
      const nextRun = new Date(c.lastExecution).getTime() + c.interval * 60 * 1000;
      return nextRun < now;
    });
  }

  getAll(): ScheduledTask[] {
    return [...this.cache.values()];
  }

  getNextExecution(typeName: string): string {
    const scheduledTask = this.cache.get(typeName);
    if (!scheduledTask) {
      throw new Error(`No scheduled task cached for "${typeName}"`);
    }
    return new Date(
      new Date(scheduledTask.lastExecution).getTime() + scheduledTask.interval * 60 * 1000
    ).toISOString();
  }

  /**
   * Ported from TaskManager.Handle(ApplicationStartedEvent): seeds/refreshes
   * the DB + in-memory cache from `defaultTaskDescriptors()`, removing any
   * stored task no longer in that list and preserving each surviving task's
   * existing `LastExecution` (only a freshly-inserted task gets "now").
   */
  initialize(): void {
    const defaultTasks = defaultTaskDescriptors(
      calculateBackupIntervalMinutes(this.configService.backupInterval),
      calculateRssSyncIntervalMinutes(this.configService.rssSyncInterval)
    );

    const currentTasks = this.scheduledTaskRepository.all();

    this.logger.trace(
      "Initializing jobs. Available: %d Existing: %d",
      defaultTasks.length,
      currentTasks.length
    );

    for (const job of currentTasks) {
      if (!defaultTasks.some((c) => c.typeName === job.typeName)) {
        this.logger.trace("Removing job from database '%s'", job.typeName);
        this.scheduledTaskRepository.delete(job.id);
      }
    }

    for (const defaultTask of defaultTasks) {
      let currentDefinition =
        currentTasks.find((c) => c.typeName === defaultTask.typeName) ?? defaultTask;

      currentDefinition = { ...currentDefinition, interval: defaultTask.interval };

      if (currentDefinition.id === 0) {
        currentDefinition = { ...currentDefinition, lastExecution: new Date().toISOString() };
      }

      currentDefinition = { ...currentDefinition, priority: defaultTask.priority };

      this.cache.set(currentDefinition.typeName, currentDefinition);
      const stored = this.scheduledTaskRepository.upsert(currentDefinition);
      this.cache.set(stored.typeName, stored);
    }
  }

  /**
   * Ported from TaskManager.Handle(CommandExecutedEvent): updates
   * LastExecution/LastStartTime for the scheduled task matching the
   * executed command's typeName, IF that command's `UpdateScheduledTask`
   * flag is set. `updateScheduledTask` / `startedAt` are passed explicitly
   * here rather than read off a `Command` object (Messaging.Commands not
   * ported -- see this module's other forward-reference notes).
   */
  onCommandExecuted(typeName: string, updateScheduledTask: boolean, startedAt: string): void {
    const scheduledTask = this.scheduledTaskRepository.all().find((c) => c.typeName === typeName);

    if (scheduledTask && updateScheduledTask) {
      this.logger.trace("Updating last run time for: %s", scheduledTask.typeName);

      const lastExecution = new Date().toISOString();

      this.scheduledTaskRepository.setLastExecutionTime(scheduledTask.id, lastExecution, startedAt);

      const cached = this.cache.get(scheduledTask.typeName);
      if (cached) {
        cached.lastExecution = lastExecution;
        cached.lastStartTime = startedAt;
      }
    }
  }

  /** Ported from TaskManager.HandleAsync(ConfigSavedEvent): re-derives rss/backup intervals and persists+re-caches both. */
  onConfigSaved(): void {
    const rss = this.scheduledTaskRepository.getDefinition("RssSyncCommand");
    rss.interval = calculateRssSyncIntervalMinutes(this.configService.rssSyncInterval);

    const backup = this.scheduledTaskRepository.getDefinition("NzbDrone.Core.Backup.BackupCommand");
    backup.interval = calculateBackupIntervalMinutes(this.configService.backupInterval);

    this.scheduledTaskRepository.updateMany([rss, backup]);

    const cachedRss = this.cache.get(rss.typeName);
    if (cachedRss) {
      cachedRss.interval = rss.interval;
    }

    const cachedBackup = this.cache.get(backup.typeName);
    if (cachedBackup) {
      cachedBackup.interval = backup.interval;
    }
  }
}
