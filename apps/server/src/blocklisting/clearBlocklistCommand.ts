import { Command } from "../messaging/commands/command.js";

/** Ported from NzbDrone.Core/Blocklisting/ClearBlocklistCommand.cs. */
export class ClearBlocklistCommand extends Command {
  /** Ported from `override bool SendUpdatesToClient => true;` (get-only override -- see messaging/commands/command.ts's doc comment on why the base is a getter/setter pair). */
  override get sendUpdatesToClient(): boolean {
    return true;
  }
}
