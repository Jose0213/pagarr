import { describe, expect, it, vi } from "vitest";
import { UnknownCommand } from "../unknownCommand.js";
import { UnknownCommandExecutor } from "../unknownCommandExecutor.js";

describe("UnknownCommand", () => {
  it("never sends updates to the client and completes with 'Skipped'", () => {
    const command = new UnknownCommand();
    expect(command.sendUpdatesToClient).toBe(false);
    expect(command.completionMessage).toBe("Skipped");
  });
});

describe("UnknownCommandExecutor", () => {
  it("logs the unknown contract name and does nothing else", () => {
    const onDebug = vi.fn();
    const executor = new UnknownCommandExecutor(onDebug);
    const command = new UnknownCommand();
    command.contractName = "SomeUnknownCommand";

    executor.execute(command);

    expect(onDebug).toHaveBeenCalledWith("Ignoring unknown command SomeUnknownCommand");
  });

  it("does not throw when no onDebug callback is provided", () => {
    const executor = new UnknownCommandExecutor();
    expect(() => executor.execute(new UnknownCommand())).not.toThrow();
  });
});
