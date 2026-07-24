import { describe, expect, it } from "vitest";
import { ImportListSyncCommand } from "../ImportListSyncCommand.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/ImportListSyncCommandFixture.cs
 * (implicitly -- the C# has no dedicated fixture for this trivial command,
 * but its three property overrides are exercised here directly since they
 * drive real scheduler/SignalR behavior once the command queue is wired
 * up).
 */
describe("ImportListSyncCommand", () => {
  it("defaults DefinitionId to null and derives its Name from the class name minus 'Command'", () => {
    const command = new ImportListSyncCommand();

    expect(command.definitionId).toBeNull();
    expect(command.name).toBe("ImportListSync");
  });

  it("SendUpdatesToClient is always true", () => {
    expect(new ImportListSyncCommand().sendUpdatesToClient).toBe(true);
    expect(new ImportListSyncCommand(5).sendUpdatesToClient).toBe(true);
  });

  it("IsTypeExclusive is always true", () => {
    expect(new ImportListSyncCommand().isTypeExclusive).toBe(true);
  });

  it("UpdateScheduledTask is true only when DefinitionId is null (a full sync, not a single-list refresh)", () => {
    expect(new ImportListSyncCommand().updateScheduledTask).toBe(true);
    expect(new ImportListSyncCommand(null).updateScheduledTask).toBe(true);
    expect(new ImportListSyncCommand(42).updateScheduledTask).toBe(false);
  });
});
