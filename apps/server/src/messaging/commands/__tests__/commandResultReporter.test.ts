import { describe, expect, it, vi } from "vitest";
import { CommandResultReporter } from "../commandResultReporter.js";
import { ProgressMessageContext } from "../progressMessageContext.js";
import { CommandResult } from "../commandResult.js";
import type { IManageCommandQueue } from "../commandQueueManager.js";
import { newCommandModel } from "../commandModel.js";
import { MessagingCleanupCommand } from "../messagingCleanupCommand.js";

describe("CommandResultReporter", () => {
  it("does nothing when there is no current command in ProgressMessageContext", () => {
    ProgressMessageContext.commandModel = null;
    const setResult = vi.fn();
    const manager = { setResult } as unknown as IManageCommandQueue;
    const reporter = new CommandResultReporter(manager);

    reporter.report(CommandResult.Successful);

    expect(setResult).not.toHaveBeenCalled();
  });

  it("sets the result on the current command via the queue manager", () => {
    const command = newCommandModel({ body: new MessagingCleanupCommand() });
    ProgressMessageContext.commandModel = command;
    try {
      const setResult = vi.fn();
      const manager = { setResult } as unknown as IManageCommandQueue;
      const reporter = new CommandResultReporter(manager);

      reporter.report(CommandResult.Successful);

      expect(setResult).toHaveBeenCalledWith(command, CommandResult.Successful);
    } finally {
      ProgressMessageContext.commandModel = null;
    }
  });

  it("is a no-op reentrant call while already reporting (LockReentrancy guard)", () => {
    const command = newCommandModel({ body: new MessagingCleanupCommand() });
    ProgressMessageContext.commandModel = command;
    try {
      expect(ProgressMessageContext.lockReentrancy()).toBe(true);

      const setResult = vi.fn();
      const manager = { setResult } as unknown as IManageCommandQueue;
      const reporter = new CommandResultReporter(manager);

      reporter.report(CommandResult.Successful);

      expect(setResult).not.toHaveBeenCalled();
    } finally {
      ProgressMessageContext.unlockReentrancy();
      ProgressMessageContext.commandModel = null;
    }
  });

  it("unlocks reentrancy after reporting, even though report() itself doesn't throw", () => {
    const command = newCommandModel({ body: new MessagingCleanupCommand() });
    ProgressMessageContext.commandModel = command;
    try {
      const manager = { setResult: vi.fn() } as unknown as IManageCommandQueue;
      const reporter = new CommandResultReporter(manager);

      reporter.report(CommandResult.Successful);

      // Lock should be released, so a second call also goes through.
      expect(ProgressMessageContext.lockReentrancy()).toBe(true);
      ProgressMessageContext.unlockReentrancy();
    } finally {
      ProgressMessageContext.commandModel = null;
    }
  });
});
