/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandPriority.cs.
 *
 * FORWARD-REFERENCE: the real home for this enum is the not-yet-ported
 * `NzbDrone.Core.Messaging.Commands` module (command queue infra --
 * `IManageCommandQueue`, `CommandQueueManager`, individual `*Command`
 * classes). `ScheduledTask.priority` (this module's own model) is typed
 * against it in C#, so it's defined here as the minimal forward-reference
 * this module needs -- matching this task's brief ("explicit... document
 * as forward-reference"). Whichever future phase ports Messaging.Commands
 * in full should re-home this value here-or-there without changing
 * `ScheduledTask.priority`'s type.
 */
export enum CommandPriority {
  Low = -1,
  Normal = 0,
  High = 1,
}
