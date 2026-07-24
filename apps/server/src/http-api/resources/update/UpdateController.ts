import { Router, type Request, type Response, type NextFunction } from "express";
import type { UpdateResource } from "./UpdateResource.js";

/**
 * Ported from Readarr.Api.V1/Update/UpdateController.cs, as a thin stub --
 * see UpdateResource.ts's doc comment for why: the core `Update` module was
 * explicitly skipped in Phase 4 (self-update isn't applicable to a
 * containerized deploy), but this task's brief calls for the HTTP endpoint
 * itself to be ported anyway, matching the real API's response SHAPE, so an
 * existing frontend client doesn't break.
 *
 * Mount path (per `[V1ApiController]`, no resource override -- the
 * class-name-minus-"Controller" default route token): `/api/v1/update`.
 *
 * `GET /` -> ported from `GetRecentUpdates()`: real body sorts
 * `_recentUpdateProvider.GetRecentUpdatePackages()` descending by version,
 * stamps `Latest`/`Installable`/`Installed`/`InstalledOn` onto the results
 * by cross-referencing `BuildInfo.Version` and `_updateHistoryService
 * .InstalledSince(...)`. This stub has no `IRecentUpdateProvider`/
 * `IUpdateHistoryService` to query (both belong to the skipped module), so
 * it always returns `[]` -- the honest answer for a container that has no
 * update-package feed to check against, and a valid (if always-empty)
 * `UpdateResource[]` a real client can render without special-casing an
 * error state.
 */
function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/** Ported from `UpdateController.GetRecentUpdates()` -- always `[]` in this port. See module doc comment. */
export function getRecentUpdates(): UpdateResource[] {
  return [];
}

export function updateController(): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler((_req, res) => {
      res.json(getRecentUpdates());
    })
  );

  return router;
}
