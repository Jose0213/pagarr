import { describe, expect, it } from "vitest";
import { HousekeepingCommand } from "../housekeepingCommand.js";

/** Ported from the naming behavior of NzbDrone.Core/Housekeeping/HousekeepingCommand.cs. */
describe("HousekeepingCommand", () => {
  it("computes name 'Housekeeping' from the runtime type name, matching NzbDrone.Core.Housekeeping.HousekeepingCommand's scheduled-task typeName", () => {
    const command = new HousekeepingCommand();
    expect(command.name).toBe("Housekeeping");
  });

  it("uses the base Command's default virtual property values (empty marker command)", () => {
    const command = new HousekeepingCommand();
    expect(command.sendUpdatesToClient).toBe(false);
    expect(command.updateScheduledTask).toBe(true);
    expect(command.isExclusive).toBe(false);
    expect(command.isLongRunning).toBe(false);
  });
});
