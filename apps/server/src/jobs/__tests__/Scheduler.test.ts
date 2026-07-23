import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPriority } from "../CommandPriority.js";
import { CommandTrigger } from "../CommandTrigger.js";
import { createScheduledTask, type ScheduledTask } from "../ScheduledTask.js";
import type { CommandQueueManagerLike } from "../Scheduler.js";
import { Scheduler } from "../Scheduler.js";
import type { ITaskManager } from "../TaskManager.js";

function fakeTaskManager(pending: ScheduledTask[] = []): ITaskManager {
  return {
    getPending: vi.fn(() => pending),
    getAll: vi.fn(() => pending),
    getNextExecution: vi.fn(() => new Date().toISOString()),
  };
}

function fakeCommandQueueManager(): CommandQueueManagerLike & { pushed: unknown[] } {
  const pushed: unknown[] = [];
  return {
    pushed,
    push: (...args) => {
      pushed.push(args);
    },
  };
}

describe("Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start() pushes pending tasks onto the command queue on each tick", () => {
    const task = createScheduledTask({ typeName: "Foo", priority: CommandPriority.High });
    const taskManager = fakeTaskManager([task]);
    const commandQueue = fakeCommandQueueManager();

    const scheduler = new Scheduler(taskManager, commandQueue, undefined, 1000);
    scheduler.start();

    vi.advanceTimersByTime(1000);

    expect(commandQueue.pushed).toHaveLength(1);
    expect(commandQueue.pushed[0]).toEqual([
      "Foo",
      task.lastExecution,
      task.lastStartTime,
      CommandPriority.High,
      CommandTrigger.Scheduled,
    ]);

    scheduler.stop();
  });

  it("ticks repeatedly at the configured interval until stop()", () => {
    const taskManager = fakeTaskManager([]);
    const commandQueue = fakeCommandQueueManager();
    const scheduler = new Scheduler(taskManager, commandQueue, undefined, 1000);

    scheduler.start();
    vi.advanceTimersByTime(3500);

    expect(taskManager.getPending).toHaveBeenCalledTimes(3);

    scheduler.stop();
    vi.advanceTimersByTime(5000);

    // No further ticks after stop().
    expect(taskManager.getPending).toHaveBeenCalledTimes(3);
  });

  it("stop() is safe to call without a prior start()", () => {
    const scheduler = new Scheduler(fakeTaskManager(), fakeCommandQueueManager());
    expect(() => scheduler.stop()).not.toThrow();
  });
});
