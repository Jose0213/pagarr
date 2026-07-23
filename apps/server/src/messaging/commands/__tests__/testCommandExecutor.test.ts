import { describe, expect, it, vi } from "vitest";
import { TestCommand } from "../testCommand.js";
import { TestCommandExecutor } from "../testCommandExecutor.js";

describe("TestCommand", () => {
  it("defaults duration to 4000ms and always sends updates to the client", () => {
    const command = new TestCommand();
    expect(command.duration).toBe(4000);
    expect(command.sendUpdatesToClient).toBe(true);
  });
});

describe("TestCommandExecutor", () => {
  it("reports progress before and after sleeping for the command's duration", async () => {
    vi.useFakeTimers();
    try {
      const onProgress = vi.fn();
      const executor = new TestCommandExecutor(onProgress);
      const command = new TestCommand();
      command.duration = 100;

      const promise = executor.execute(command);

      expect(onProgress).toHaveBeenCalledWith("Starting Test command. duration 100");
      expect(onProgress).not.toHaveBeenCalledWith("Completed Test command");

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(onProgress).toHaveBeenCalledWith("Completed Test command");
    } finally {
      vi.useRealTimers();
    }
  });
});
