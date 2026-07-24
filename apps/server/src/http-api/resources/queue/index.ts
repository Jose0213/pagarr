/**
 * `apps/server/src/http-api/resources/queue/` -- Readarr.Api.V1/Queue/*
 * ported (QueueController, QueueDetailsController, QueueActionController,
 * QueueStatusController + their resources). See each file's own doc
 * comment for the exact C# source it ports and any deviations.
 *
 * This barrel is NOT wired into `../../app.ts`'s bootstrap -- per this
 * worktree's task brief, that composition-root wiring (mounting each
 * exported router at its real route base: `queueController` at `/queue`,
 * `queueActionController` ALSO at `/queue` (both controllers share that
 * prefix in the real app -- see QueueActionController.ts's doc comment),
 * `queueDetailsController` at `/queue/details`, `queueStatusController` at
 * `/queue/status`) is left to whoever assembles the full API surface.
 */

export {
  queueController,
  type QueueControllerOptions,
  type PendingReleaseServiceLike,
  type BlockPendingReleaseLike,
} from "./QueueController.js";
export {
  queueActionController,
  type QueueActionControllerOptions,
  type DownloadReportLike,
} from "./QueueActionController.js";
export {
  queueDetailsController,
  type QueueDetailsControllerOptions,
} from "./QueueDetailsController.js";
export {
  queueStatusController,
  computeQueueStatus,
  type QueueStatusControllerOptions,
} from "./QueueStatusController.js";
export { toQueueResource, type QueueResource } from "./QueueResource.js";
export type { QueueBulkResource } from "./QueueBulkResource.js";
export type { QueueStatusResource } from "./QueueStatusResource.js";
