import { describe, expect, it } from "vitest";
import { BackupCommand } from "../backupCommand.js";
import { BackupType } from "../backup.js";
import { CommandTrigger } from "../../messaging/commands/commandTrigger.js";

describe("BackupCommand", () => {
  it("defaults to BackupType.Manual when trigger is unspecified", () => {
    const command = new BackupCommand();
    expect(command.type).toBe(BackupType.Manual);
  });

  it("is BackupType.Scheduled when the trigger is Scheduled", () => {
    const command = new BackupCommand();
    command.trigger = CommandTrigger.Scheduled;
    expect(command.type).toBe(BackupType.Scheduled);
  });

  it("is BackupType.Manual when the trigger is Manual", () => {
    const command = new BackupCommand();
    command.trigger = CommandTrigger.Manual;
    expect(command.type).toBe(BackupType.Manual);
  });

  it("always sends updates to client", () => {
    expect(new BackupCommand().sendUpdatesToClient).toBe(true);
  });

  it("updateScheduledTask is true only when scheduled", () => {
    const command = new BackupCommand();
    expect(command.updateScheduledTask).toBe(false);

    command.trigger = CommandTrigger.Scheduled;
    expect(command.updateScheduledTask).toBe(true);
  });

  it("derives its command name as 'Backup' (Command base strips 'Command' suffix)", () => {
    expect(new BackupCommand().name).toBe("Backup");
  });
});
