import { describe, expect, it, vi } from "vitest";
import { HousekeepingService } from "../housekeepingService.js";
import { HousekeepingCommand } from "../housekeepingCommand.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Translated from the intent of NzbDrone.Core/Housekeeping/HousekeepingService.cs:
 * runs every task, isolates failures per-task, and always vacuums the main
 * DB afterward.
 */
describe("HousekeepingService", () => {
  it("runs every housekeeper's clean() and vacuums the main db afterward", async () => {
    const order: string[] = [];
    const taskA: IHousekeepingTask = { clean: () => order.push("A") };
    const taskB: IHousekeepingTask = { clean: () => order.push("B") };
    const vacuum = vi.fn();

    const service = new HousekeepingService([taskA, taskB], { vacuum });

    await service.execute(new HousekeepingCommand());

    expect(order).toEqual(["A", "B"]);
    expect(vacuum).toHaveBeenCalledTimes(1);
  });

  it("isolates a failing task so later tasks and the vacuum still run", async () => {
    const order: string[] = [];
    const failing: IHousekeepingTask = {
      clean: () => {
        throw new Error("boom");
      },
    };
    const after: IHousekeepingTask = { clean: () => order.push("after") };
    const vacuum = vi.fn();
    const onTaskError = vi.fn();

    const service = new HousekeepingService([failing, after], { vacuum }, undefined, onTaskError);

    await service.execute(new HousekeepingCommand());

    expect(order).toEqual(["after"]);
    expect(vacuum).toHaveBeenCalledTimes(1);
    expect(onTaskError).toHaveBeenCalledTimes(1);
    expect(onTaskError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it("awaits async task.clean() implementations before moving on", async () => {
    const order: string[] = [];
    const asyncTask: IHousekeepingTask = {
      clean: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        order.push("async-done");
      },
    };
    const syncTask: IHousekeepingTask = { clean: () => order.push("sync") };

    const service = new HousekeepingService([asyncTask, syncTask], { vacuum: vi.fn() });

    await service.execute(new HousekeepingCommand());

    expect(order).toEqual(["async-done", "sync"]);
  });
});
