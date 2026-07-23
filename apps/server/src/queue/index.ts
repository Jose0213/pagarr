/**
 * Barrel export for the Queue module -- port of NzbDrone.Core/Queue/*.cs.
 * Folded into this worktree alongside Messaging (queue-adjacent, depends on
 * the already-merged download-tracking module's TrackedDownload) -- see
 * this worktree's final report.
 *
 * NOTE for the human reconciliation pass: `download-tracking/queueItem.ts`
 * already declares its own local forward-ref `QueueItem` (used only by
 * `download-tracking/pending/pendingReleaseService.ts`), predating this
 * module and explicitly documented there as "When Queue lands, this should
 * be deleted in favor of importing the real type." That file is outside
 * this worktree's scope (`download-tracking/` isn't `messaging/` or
 * `queue/`) so it's left untouched -- see this module's real `QueueItem`
 * in `queue.ts` for the faithful port to eventually replace it with.
 */
export * from "./queue.js";
export * from "./queueService.js";
export * from "./queueUpdatedEvent.js";
export * from "./estimatedCompletionTimeComparer.js";
export * from "./timeleftComparer.js";
