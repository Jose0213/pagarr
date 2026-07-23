import { beforeEach, describe, expect, it } from "vitest";
import { CommandPriority } from "../CommandPriority.js";
import { createScheduledTask, type ScheduledTask } from "../ScheduledTask.js";
import type { IScheduledTaskRepository } from "../ScheduledTaskRepository.js";
import {
  calculateBackupIntervalMinutes,
  calculateRssSyncIntervalMinutes,
  defaultTaskDescriptors,
  TaskManager,
  type TaskManagerConfig,
} from "../TaskManager.js";

function inMemoryRepository(): IScheduledTaskRepository & { store: Map<number, ScheduledTask> } {
  const store = new Map<number, ScheduledTask>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => store.get(id)!,
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    updateMany: (models) => {
      for (const m of models) {
        store.set(m.id, m);
      }
    },
    upsert: (model) => {
      const withId = model.id === 0 ? { ...model, id: nextId++ } : model;
      store.set(withId.id, withId);
      return withId;
    },
    delete: (id) => {
      store.delete(id);
    },
    getDefinition: (typeName) => {
      const found = [...store.values()].find((t) => t.typeName === typeName);
      if (!found) {
        throw new Error(`not found: ${typeName}`);
      }
      return found;
    },
    setLastExecutionTime: (id, executionTime, startTime) => {
      const existing = store.get(id);
      if (existing) {
        store.set(id, { ...existing, lastExecution: executionTime, lastStartTime: startTime });
      }
    },
  };
}

function fakeConfig(overrides: Partial<TaskManagerConfig> = {}): TaskManagerConfig {
  return { backupInterval: 7, rssSyncInterval: 15, ...overrides };
}

describe("calculateBackupIntervalMinutes", () => {
  it("clamps below-1-day values to 1 day, converts days to minutes", () => {
    expect(calculateBackupIntervalMinutes(7)).toBe(7 * 60 * 24);
    expect(calculateBackupIntervalMinutes(0)).toBe(1 * 60 * 24);
    expect(calculateBackupIntervalMinutes(-3)).toBe(1 * 60 * 24);
  });
});

describe("calculateRssSyncIntervalMinutes", () => {
  it("clamps 1-9 up to 10, matching GetRssSyncInterval()", () => {
    expect(calculateRssSyncIntervalMinutes(5)).toBe(10);
    expect(calculateRssSyncIntervalMinutes(9)).toBe(10);
  });

  it("clamps negative values to 0 (disabled)", () => {
    expect(calculateRssSyncIntervalMinutes(-1)).toBe(0);
  });

  it("passes through 0 and values >= 10 unchanged", () => {
    expect(calculateRssSyncIntervalMinutes(0)).toBe(0);
    expect(calculateRssSyncIntervalMinutes(15)).toBe(15);
    expect(calculateRssSyncIntervalMinutes(60)).toBe(60);
  });
});

describe("defaultTaskDescriptors", () => {
  it("produces 10 tasks with the backup/rss intervals substituted", () => {
    const tasks = defaultTaskDescriptors(1440, 15);
    expect(tasks).toHaveLength(10);
    expect(tasks.find((t) => t.typeName === "RssSyncCommand")?.interval).toBe(15);
    expect(tasks.find((t) => t.typeName === "NzbDrone.Core.Backup.BackupCommand")?.interval).toBe(
      1440
    );
  });

  it("RefreshMonitoredDownloadsCommand runs at High priority, matching the C# source", () => {
    const tasks = defaultTaskDescriptors(1440, 15);
    const refresh = tasks.find((t) => t.typeName.endsWith("RefreshMonitoredDownloadsCommand"));
    expect(refresh?.priority).toBe(CommandPriority.High);
  });
});

describe("TaskManager", () => {
  let repo: ReturnType<typeof inMemoryRepository>;
  let manager: TaskManager;

  beforeEach(() => {
    repo = inMemoryRepository();
    manager = new TaskManager(repo, fakeConfig());
  });

  it("initialize() seeds the DB and cache with the default tasks", () => {
    manager.initialize();

    expect(repo.all()).toHaveLength(10);
    expect(manager.getAll()).toHaveLength(10);
  });

  it("initialize() sets lastExecution to now for freshly-inserted tasks", () => {
    const before = Date.now();
    manager.initialize();
    const after = Date.now();

    for (const task of manager.getAll()) {
      const executedAt = new Date(task.lastExecution).getTime();
      expect(executedAt).toBeGreaterThanOrEqual(before);
      expect(executedAt).toBeLessThanOrEqual(after);
    }
  });

  it("initialize() preserves an existing task's lastExecution on re-initialize", () => {
    manager.initialize();
    const rssBefore = manager.getAll().find((t) => t.typeName === "RssSyncCommand")!;

    const manager2 = new TaskManager(repo, fakeConfig());
    manager2.initialize();

    const rssAfter = manager2.getAll().find((t) => t.typeName === "RssSyncCommand")!;
    expect(rssAfter.lastExecution).toBe(rssBefore.lastExecution);
  });

  it("initialize() removes a stored task no longer in the default list", () => {
    repo.insert(createScheduledTask({ typeName: "SomeRemovedCommand", interval: 5 }));
    manager.initialize();

    expect(repo.all().some((t) => t.typeName === "SomeRemovedCommand")).toBe(false);
  });

  it("getPending() returns tasks whose interval has elapsed since lastExecution", () => {
    // Both typeNames must be in defaultTaskDescriptors()'s fixed list --
    // initialize() deletes/ignores anything else (verified by the
    // "removes a stored task no longer in the default list" test above).
    // Their `interval` is baked in as a fixed value by defaultTaskDescriptors()
    // itself (5 minutes for ImportListSyncCommand, 24h for RescanFoldersCommand),
    // NOT preserved from whatever was inserted here -- only `lastExecution`
    // survives a re-initialize for an already-existing row, matching the
    // real C# `currentDefinition.Interval = defaultTask.Interval` always-
    // overwrite behavior.
    repo.insert(
      createScheduledTask({
        typeName: "NzbDrone.Core.ImportLists.ImportListSyncCommand", // fixed 5-minute interval
        lastExecution: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
    );
    repo.insert(
      createScheduledTask({
        typeName: "NzbDrone.Core.MediaFiles.Commands.RescanFoldersCommand", // fixed 24h interval
        lastExecution: new Date().toISOString(),
      })
    );
    manager = new TaskManager(repo, fakeConfig());
    manager.initialize();

    const pending = manager.getPending().map((t) => t.typeName);
    expect(pending).toContain("NzbDrone.Core.ImportLists.ImportListSyncCommand");
    expect(pending).not.toContain("NzbDrone.Core.MediaFiles.Commands.RescanFoldersCommand");
  });

  it("getPending() excludes tasks with interval <= 0", () => {
    // A negative configured rssSyncInterval clamps to 0 (disabled) via
    // calculateRssSyncIntervalMinutes(), which initialize() bakes into
    // RssSyncCommand's interval -- the one default task whose interval is
    // config-driven and can legitimately reach 0.
    manager = new TaskManager(repo, fakeConfig({ rssSyncInterval: -1 }));
    manager.initialize();

    expect(manager.getPending().map((t) => t.typeName)).not.toContain("RssSyncCommand");
    expect(manager.getAll().find((t) => t.typeName === "RssSyncCommand")?.interval).toBe(0);
  });

  it("getNextExecution() computes lastExecution + interval minutes", () => {
    const lastExecution = new Date("2026-01-01T00:00:00.000Z").toISOString();
    repo.insert(
      createScheduledTask({
        typeName: "NzbDrone.Core.ImportLists.ImportListSyncCommand", // fixed 5-minute interval
        lastExecution,
      })
    );
    manager = new TaskManager(repo, fakeConfig());
    manager.initialize();

    expect(manager.getNextExecution("NzbDrone.Core.ImportLists.ImportListSyncCommand")).toBe(
      new Date(new Date(lastExecution).getTime() + 5 * 60 * 1000).toISOString()
    );
  });

  it("onCommandExecuted() updates lastExecution/lastStartTime when updateScheduledTask is true", () => {
    manager.initialize();
    const startedAt = new Date().toISOString();

    manager.onCommandExecuted("RssSyncCommand", true, startedAt);

    const task = manager.getAll().find((t) => t.typeName === "RssSyncCommand")!;
    expect(task.lastStartTime).toBe(startedAt);
    expect(repo.getDefinition("RssSyncCommand").lastStartTime).toBe(startedAt);
  });

  it("onCommandExecuted() is a no-op when updateScheduledTask is false", () => {
    manager.initialize();
    const before = manager.getAll().find((t) => t.typeName === "RssSyncCommand")!.lastExecution;

    manager.onCommandExecuted("RssSyncCommand", false, new Date().toISOString());

    const after = manager.getAll().find((t) => t.typeName === "RssSyncCommand")!.lastExecution;
    expect(after).toBe(before);
  });

  it("onCommandExecuted() is a no-op for a typeName with no matching scheduled task", () => {
    manager.initialize();
    expect(() => manager.onCommandExecuted("Ghost", true, new Date().toISOString())).not.toThrow();
  });

  it("onConfigSaved() re-derives and persists rss/backup intervals from the config service", () => {
    manager.initialize();

    const configWithNewValues = fakeConfig({ rssSyncInterval: 5, backupInterval: 3 });
    const manager2 = new TaskManager(repo, configWithNewValues);
    manager2.initialize();
    manager2.onConfigSaved();

    const rss = manager2.getAll().find((t) => t.typeName === "RssSyncCommand")!;
    const backup = manager2
      .getAll()
      .find((t) => t.typeName === "NzbDrone.Core.Backup.BackupCommand")!;

    // rssSyncInterval=5 clamps to 10 (GetRssSyncInterval's 1-9 -> 10 rule).
    expect(rss.interval).toBe(10);
    expect(backup.interval).toBe(3 * 60 * 24);
  });
});
