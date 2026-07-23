/** Ported from NzbDrone.Core/Messaging/Commands/CommandNotFoundException.cs. */
export class CommandNotFoundException extends Error {
  constructor(contract: string) {
    super("Couldn't find command " + contract);
    this.name = "CommandNotFoundException";
  }
}
