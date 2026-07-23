import { afterEach, describe, expect, it } from "vitest";
import { ProgressMessageContext } from "../progressMessageContext.js";
import { newCommandModel } from "../commandModel.js";
import { MessagingCleanupCommand } from "../messagingCleanupCommand.js";

describe("ProgressMessageContext", () => {
  afterEach(() => {
    ProgressMessageContext.commandModel = null;
    ProgressMessageContext.unlockReentrancy();
  });

  it("defaults commandModel to null", () => {
    expect(ProgressMessageContext.commandModel).toBeNull();
  });

  it("stores and returns the current command model", () => {
    const command = newCommandModel({ body: new MessagingCleanupCommand() });
    ProgressMessageContext.commandModel = command;
    expect(ProgressMessageContext.commandModel).toBe(command);
  });

  it("lockReentrancy returns true once, then false until unlocked", () => {
    expect(ProgressMessageContext.lockReentrancy()).toBe(true);
    expect(ProgressMessageContext.lockReentrancy()).toBe(false);

    ProgressMessageContext.unlockReentrancy();

    expect(ProgressMessageContext.lockReentrancy()).toBe(true);
  });
});
