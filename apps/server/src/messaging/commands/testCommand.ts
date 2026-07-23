import { Command } from "./command.js";

/** Ported from NzbDrone.Core/Messaging/Commands/TestCommand.cs. */
export class TestCommand extends Command {
  duration = 4000;

  /** Ported from `override bool SendUpdatesToClient => true;` (a get-only override -- see command.ts's doc comment on why the base is a getter/setter pair rather than a plain field). */
  override get sendUpdatesToClient(): boolean {
    return true;
  }
}
