import { Command } from "../messaging/index.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListSyncCommand.cs.
 *
 * `Command` here is the REAL `messaging/commands/command.ts` base (per this
 * module's task brief -- ImportLists is a real consumer of the now-ported
 * Messaging module, not a forward-referenced marker class the way
 * `download-tracking/commands.ts`'s pre-Messaging commands had to be, see
 * that file's doc comment for the superseded pattern).
 */
export class ImportListSyncCommand extends Command {
  definitionId: number | null;

  constructor(definitionId: number | null = null) {
    super();
    this.definitionId = definitionId;
  }

  /** Ported from `override bool SendUpdatesToClient => true;`. */
  override get sendUpdatesToClient(): boolean {
    return true;
  }

  /** Ported from `override bool IsTypeExclusive => true;`. */
  override get isTypeExclusive(): boolean {
    return true;
  }

  /** Ported from `override bool UpdateScheduledTask => !DefinitionId.HasValue;`. */
  override get updateScheduledTask(): boolean {
    return this.definitionId === null;
  }
}
