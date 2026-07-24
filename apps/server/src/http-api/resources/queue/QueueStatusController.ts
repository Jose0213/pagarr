import { Router } from "express";
import type { IQueueService } from "../../../queue/queueService.js";
import { TrackedDownloadStatus } from "../../../download-tracking/tracked-downloads/trackedDownload.js";
import type { PendingReleaseServiceLike } from "./QueueController.js";
import type { QueueStatusResource } from "./QueueStatusResource.js";

/**
 * Ported from Readarr.Api.V1/Queue/QueueStatusController.cs. Mounted at
 * `/queue/status` (the real `[V1ApiController("queue/status")]` route
 * base).
 *
 * ## Debounced SignalR broadcast -- NOT ported here
 *
 * The real controller wraps every `GetQueueStatus()` call in
 * `_broadcastDebounce.Pause()`/`.Resume()` (a 5-second `Debouncer` firing
 * `BroadcastChange()` on `QueueUpdatedEvent`/`PendingReleasesUpdatedEvent`).
 * That's SignalR push-broadcast plumbing orthogonal to this synchronous
 * `GET /` computation -- `computeQueueStatus()` below is the pure,
 * side-effect-free computation the real handler wraps; a caller wiring
 * this controller up to a live `EventAggregator`/`SignalRBroadcaster` can
 * layer the same `Debouncer` (queue/... has no ported Debouncer of its own
 * yet, matching this port's established "not ported until a real caller
 * needs it" convention -- see e.g. `download-tracking/tracked-downloads/
 * debouncer.ts`, which DOES exist and is the direct source for a future
 * wiring of this exact broadcast) around a call to this same function.
 */
export interface QueueStatusControllerOptions {
  queueService: IQueueService;
  pendingReleaseService: PendingReleaseServiceLike;
}

/** Ported from `QueueStatusController.GetQueueStatus()`'s pure computation (see module doc comment on the debounce wrapper this omits). */
export function computeQueueStatus(
  queueService: IQueueService,
  pendingReleaseService: PendingReleaseServiceLike
): QueueStatusResource {
  const queue = queueService.getQueue();
  const pending = pendingReleaseService.getPendingQueue();

  return {
    id: 0,
    totalCount: queue.length + pending.length,
    count: queue.filter((q) => q.author !== null).length + pending.length,
    unknownCount: queue.filter((q) => q.author === null).length,
    errors: queue.some(
      (q) => q.author !== null && q.trackedDownloadStatus === TrackedDownloadStatus.Error
    ),
    warnings: queue.some(
      (q) => q.author !== null && q.trackedDownloadStatus === TrackedDownloadStatus.Warning
    ),
    unknownErrors: queue.some(
      (q) => q.author === null && q.trackedDownloadStatus === TrackedDownloadStatus.Error
    ),
    unknownWarnings: queue.some(
      (q) => q.author === null && q.trackedDownloadStatus === TrackedDownloadStatus.Warning
    ),
  };
}

/** Ported from `QueueStatusController`. Mounted at `/queue/status`. */
export function queueStatusController(options: QueueStatusControllerOptions): Router {
  const { queueService, pendingReleaseService } = options;

  const router = Router();

  // ---- GET / ----------------------------------------------------------
  router.get("/", (_req, res) => {
    res.json(computeQueueStatus(queueService, pendingReleaseService));
  });

  return router;
}
