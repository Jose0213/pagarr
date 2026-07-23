import { describe, expect, it, vi } from "vitest";
import { CleanupCommandQueue } from "../housekeepers/cleanupCommandQueue.js";
import type { IManageCommandQueue } from "../../messaging/commands/commandQueueManager.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupCommandQueue.cs. */
describe("CleanupCommandQueue", () => {
  it("delegates to commandQueueManager.cleanCommands()", () => {
    const cleanCommands = vi.fn();
    const manager = { cleanCommands } as unknown as IManageCommandQueue;

    new CleanupCommandQueue(manager).clean();

    expect(cleanCommands).toHaveBeenCalledTimes(1);
  });
});
