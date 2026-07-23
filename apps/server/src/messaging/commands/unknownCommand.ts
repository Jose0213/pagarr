import { Command } from "./command.js";

/** Ported from NzbDrone.Core/Messaging/Commands/UnknownCommand.cs. */
export class UnknownCommand extends Command {
  contractName: string | null = null;

  /** Ported from `override bool SendUpdatesToClient => false;` (a get-only override -- see command.ts's doc comment). */
  override get sendUpdatesToClient(): boolean {
    return false;
  }

  /** Ported from `override string CompletionMessage => "Skipped";`. */
  override get completionMessage(): string {
    return "Skipped";
  }
}
