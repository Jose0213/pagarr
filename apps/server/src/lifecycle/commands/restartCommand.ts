import { Command } from "../../messaging/index.js";

/**
 * Ported from NzbDrone.Core/Lifecycle/Commands/RestartCommand.cs.
 *
 * C#: `public class RestartCommand : Command` with no members of its own --
 * every behavior (`Name`, `SendUpdatesToClient`, etc.) comes from the base
 * `Command` class (see `messaging/commands/command.ts`). Dispatched through
 * `IManageCommandQueue` and handled by `LifecycleService.Execute(
 * RestartCommand message)` (this module's `lifecycleService.ts`).
 */
export class RestartCommand extends Command {}
