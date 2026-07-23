/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandTrigger.cs.
 * See CommandPriority.ts's doc comment re: forward-reference rationale --
 * used by Scheduler.ts's ported `_commandQueueManager.Push(...,
 * CommandTrigger.Scheduled)` call site.
 */
export enum CommandTrigger {
  Unspecified = 0,
  Manual = 1,
  Scheduled = 2,
}
