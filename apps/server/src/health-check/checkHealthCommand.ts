import { Command } from "../messaging/index.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/CheckHealthCommand.cs. An empty
 * `Command` subclass -- `HealthCheckService.Execute(CheckHealthCommand
 * message)` only reads `message.Trigger` (inherited from the base `Command`,
 * see `messaging/commands/command.ts`) to decide manual-vs-scheduled scope.
 */
export class CheckHealthCommand extends Command {}
