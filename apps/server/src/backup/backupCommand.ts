import { Command } from "../messaging/commands/command.js";
import { CommandTrigger } from "../messaging/commands/commandTrigger.js";
import { BackupType } from "./backup.js";

/** Ported from NzbDrone.Core/Backup/BackupCommand.cs. */
export class BackupCommand extends Command {
  /** Ported from `public BackupType Type => Trigger == CommandTrigger.Scheduled ? BackupType.Scheduled : BackupType.Manual;` */
  get type(): BackupType {
    if (this.trigger === CommandTrigger.Scheduled) {
      return BackupType.Scheduled;
    }

    return BackupType.Manual;
  }

  /** Ported from `override bool SendUpdatesToClient => true;` (get-only override -- see messaging/commands/command.ts's doc comment on why the base is a getter/setter pair). */
  override get sendUpdatesToClient(): boolean {
    return true;
  }

  /** Ported from `override bool UpdateScheduledTask => Type == BackupType.Scheduled;`. */
  override get updateScheduledTask(): boolean {
    return this.type === BackupType.Scheduled;
  }
}
