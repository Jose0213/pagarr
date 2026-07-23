import { describe, expect, it } from "vitest";
import { RestartCommand } from "../commands/restartCommand.js";
import { ShutdownCommand } from "../commands/shutdownCommand.js";

/**
 * No C# test fixture exists for RestartCommand/ShutdownCommand -- they're
 * trivial marker subclasses of `Command` with no members of their own.
 * These tests confirm the inherited `Command` behavior (name derivation --
 * see messaging/commands/command.ts's `Name = GetType().Name.Replace(
 * "Command", "")` port) works correctly for these two concrete subclasses,
 * the same way command.test.ts covers Command's base behavior generically.
 */
describe("RestartCommand", () => {
  it("derives its name by stripping 'Command' from the class name", () => {
    const command = new RestartCommand();
    expect(command.name).toBe("Restart");
  });

  it("uses the Command base class defaults", () => {
    const command = new RestartCommand();
    expect(command.sendUpdatesToClient).toBe(false);
    expect(command.updateScheduledTask).toBe(true);
    expect(command.completionMessage).toBeNull();
    expect(command.requiresDiskAccess).toBe(false);
    expect(command.isExclusive).toBe(false);
    expect(command.isTypeExclusive).toBe(false);
    expect(command.isLongRunning).toBe(false);
  });
});

describe("ShutdownCommand", () => {
  it("derives its name by stripping 'Command' from the class name", () => {
    const command = new ShutdownCommand();
    expect(command.name).toBe("Shutdown");
  });

  it("uses the Command base class defaults", () => {
    const command = new ShutdownCommand();
    expect(command.sendUpdatesToClient).toBe(false);
    expect(command.updateScheduledTask).toBe(true);
    expect(command.completionMessage).toBeNull();
    expect(command.requiresDiskAccess).toBe(false);
    expect(command.isExclusive).toBe(false);
    expect(command.isTypeExclusive).toBe(false);
    expect(command.isLongRunning).toBe(false);
  });
});
