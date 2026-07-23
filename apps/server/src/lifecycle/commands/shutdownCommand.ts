import { Command } from "../../messaging/index.js";

/**
 * Ported from NzbDrone.Core/Lifecycle/Commands/ShutdownCommand.cs.
 *
 * C#: `public class ShutdownCommand : Command` with no members of its own --
 * every behavior (`Name`, `SendUpdatesToClient`, etc.) comes from the base
 * `Command` class (see `messaging/commands/command.ts`). Dispatched through
 * `IManageCommandQueue` and handled by `LifecycleService.Execute(
 * ShutdownCommand message)` (this module's `lifecycleService.ts`).
 */
export class ShutdownCommand extends Command {}
