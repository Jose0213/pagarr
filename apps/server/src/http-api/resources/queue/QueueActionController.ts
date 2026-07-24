import { Router } from "express";
import type { RemoteBook } from "../../../parser/model/remoteBook.js";
import { NotFoundException } from "../../rest/NotFoundException.js";
import type { PendingReleaseServiceLike } from "./QueueController.js";
import type { QueueBulkResource } from "./QueueBulkResource.js";

/**
 * Ported from Readarr.Api.V1/Queue/QueueActionController.cs. Mounted at
 * `/queue` (the real `[V1ApiController("queue")]` route base -- this
 * controller's own routes are `POST grab/{id}` and `POST grab/bulk`, both
 * relative to that base, matching `QueueController`'s own mount point;
 * both controllers are mounted side-by-side under the same `/queue` prefix
 * in the real app, exactly as this module and `QueueController.ts` are
 * meant to be composed together by the caller).
 *
 * ## `IDownloadService.DownloadReport` collaborator type -- forward-ref gap, documented
 *
 * The real C# `IDownloadService.DownloadReport(RemoteBook remoteBook,
 * int? downloadClientId)` takes `NzbDrone.Core.Parser.Model.RemoteBook` --
 * exactly the type `PendingReleaseServiceLike.findPendingQueueItem(id)`
 * returns on `.remoteBook` (Parser's real, ported
 * `parser/model/remoteBook.ts` `RemoteBook`, per `queue/queue.ts`'s
 * `QueueItem.remoteBook` field). This module types its own `downloadReport`
 * collaborator against that same real Parser `RemoteBook` directly for that
 * reason.
 *
 * The already-merged, real `download-tracking/downloadService.ts`
 * `IDownloadService.downloadReport` in THIS worktree, however, takes
 * DecisionEngine's forward-ref `RemoteBook` (decision-engine/remoteBook.ts)
 * instead -- a distinct, stricter type (non-nullable `release`/
 * `parsedBookInfo`/`author`, and `author: AuthorWithQualityProfile`, not
 * plain `Author`). This is the SAME documented Parser-vs-DecisionEngine
 * `RemoteBook` split `download-tracking/pending/pendingReleaseService.ts`'s
 * own header comment calls out (see `insertFromDecision`'s doc comment
 * there for the established adapter pattern going the OTHER direction,
 * DecisionEngine -> Parser). Bridging Parser's `RemoteBook` back into
 * DecisionEngine's stricter shape here would require synthesizing a
 * `qualityProfile` onto `remoteBook.author` and asserting non-null on
 * fields Parser's type allows null -- a real, silent-failure-risk adapter
 * that belongs in a dedicated reconciliation pass (per this task's
 * "document gaps rather than paper over them" instruction), not invented
 * ad hoc inside this controller.
 *
 * `downloadReport` is therefore injected here typed against Parser's real
 * `RemoteBook` (matching what this module's own inputs actually carry) --
 * a composition root wiring this controller to the real `DownloadService`
 * needs the same kind of adapter `pendingReleaseService.ts` already
 * demonstrates, not a new type on either side.
 */
export interface DownloadReportLike {
  downloadReport(remoteBook: RemoteBook, downloadClientId: number | null): Promise<void>;
}

export interface QueueActionControllerOptions {
  pendingReleaseService: PendingReleaseServiceLike;
  downloadService: DownloadReportLike;
}

/** Ported from `QueueActionController`. Mounted at `/queue`. */
export function queueActionController(options: QueueActionControllerOptions): Router {
  const { pendingReleaseService, downloadService } = options;

  const router = Router();

  // ---- POST grab/bulk ---------------------------------------------------
  // Mounted BEFORE "grab/:id" so Express doesn't treat "bulk" as an :id value.
  router.post("/grab/bulk", (req, res, next) => {
    void (async () => {
      try {
        const resource = req.body as QueueBulkResource;

        for (const id of resource.ids) {
          const pendingRelease = pendingReleaseService.findPendingQueueItem(id);
          if (!pendingRelease) {
            throw new NotFoundException();
          }
          if (!pendingRelease.remoteBook) {
            throw new NotFoundException();
          }

          await downloadService.downloadReport(pendingRelease.remoteBook, null);
        }

        res.json({});
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- POST grab/:id ------------------------------------------------------
  router.post("/grab/:id", (req, res, next) => {
    void (async () => {
      try {
        const id = Number.parseInt(req.params["id"] ?? "", 10);
        const pendingRelease = pendingReleaseService.findPendingQueueItem(id);

        if (!pendingRelease) {
          throw new NotFoundException();
        }
        if (!pendingRelease.remoteBook) {
          throw new NotFoundException();
        }

        await downloadService.downloadReport(pendingRelease.remoteBook, null);

        res.json({});
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
