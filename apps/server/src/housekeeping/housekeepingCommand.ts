import { Command } from "../messaging/commands/command.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/HousekeepingCommand.cs.
 *
 * C#: `public class HousekeepingCommand : Command { }` -- an empty marker
 * command, all behavior lives in `HousekeepingService.Execute`. Name is
 * computed by the base `Command` constructor from the runtime type name
 * ("HousekeepingCommand" -> "Housekeeping"), matching
 * `NzbDrone.Core.Housekeeping.HousekeepingCommand`'s scheduled-task
 * `typeName` referenced by `jobs/TaskManager.ts`'s doc comment (line 31).
 */
export class HousekeepingCommand extends Command {}
