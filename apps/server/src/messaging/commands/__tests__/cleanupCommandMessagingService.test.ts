import { describe, expect, it, vi } from "vitest";
import { CleanupCommandMessagingService } from "../cleanupCommandMessagingService.js";
import { MessagingCleanupCommand } from "../messagingCleanupCommand.js";
import type { IManageCommandQueue } from "../commandQueueManager.js";

describe("CleanupCommandMessagingService", () => {
  it("delegates to commandQueueManager.cleanCommands()", () => {
    const cleanCommands = vi.fn();
    const manager = { cleanCommands } as unknown as IManageCommandQueue;
    const service = new CleanupCommandMessagingService(manager);

    service.execute(new MessagingCleanupCommand());

    expect(cleanCommands).toHaveBeenCalledTimes(1);
  });
});
