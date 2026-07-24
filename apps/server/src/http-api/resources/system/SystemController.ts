import { Router, type Request, type Response, type NextFunction } from "express";
import type { ILifecycleService } from "../../../lifecycle/lifecycleService.js";
import { getSystemStatus, type SystemStatusDeps } from "./SystemResource.js";

/**
 * Ported from Readarr.Api.V1/System/SystemController.cs. Mount path (per
 * the real `[V1ApiController]`, no override resource -- so `[controller]`
 * resolves to the class name minus "Controller", lowercased by ASP.NET's
 * default route-token convention): `/api/v1/system`.
 *
 * ## Routes ported
 *
 *   - `GET  /status`          -> GetStatus(): full SystemResource snapshot.
 *   - `POST /shutdown`        -> Shutdown(): `{ shuttingDown: true }`,
 *     fires `lifecycleService.shutdown()` asynchronously (ported from
 *     `Task.Factory.StartNew(() => _lifecycleService.Shutdown())` --
 *     fire-and-forget, the response does not await it, matching the real
 *     source returning immediately while the shutdown runs on its own
 *     task).
 *   - `POST /restart`         -> Restart(): same shape, `restart()`.
 *
 * ## Routes NOT reproduced (documented, not silently dropped)
 *
 *   - `GET /routes` / `GET /routes/duplicate`: these introspect ASP.NET's
 *     own `EndpointDataSource` (the live MVC routing table) via
 *     `DfaGraphWriter`/`DuplicateEndpointDetector` -- both ASP.NET-Core-
 *     internal routing machinery with no Express equivalent (Express has no
 *     analogous "dump the compiled route DFA as a graph" or "detect
 *     duplicate route templates at startup" introspection API, and nothing
 *     else in this port depends on either response). Mounted here as thin
 *     stubs returning a 501-shaped "not applicable to this port" body
 *     rather than omitted entirely, so a client hitting either path gets an
 *     explicit, documented signal instead of a bare 404 that looks like a
 *     routing bug.
 */
export interface SystemControllerDeps extends SystemStatusDeps {
  lifecycleService: ILifecycleService;
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function systemController(deps: SystemControllerDeps): Router {
  const router = Router();

  router.get(
    "/status",
    asyncHandler((_req, res) => {
      res.json(getSystemStatus(deps));
    })
  );

  // Ported: ASP.NET routing-table introspection, no Express equivalent -- see module doc comment.
  router.get("/routes", (_req, res) => {
    res
      .status(501)
      .type("text/plain")
      .send("Route graph introspection is not applicable to this port.");
  });

  router.get("/routes/duplicate", (_req, res) => {
    res.status(501).json({
      message: "Duplicate-route detection is not applicable to this port.",
    });
  });

  router.post(
    "/shutdown",
    asyncHandler((_req, res) => {
      // Ported from `Task.Factory.StartNew(() => _lifecycleService.Shutdown())`
      // -- fire-and-forget, response returns before shutdown completes.
      queueMicrotask(() => deps.lifecycleService.shutdown());
      res.json({ shuttingDown: true });
    })
  );

  router.post(
    "/restart",
    asyncHandler((_req, res) => {
      queueMicrotask(() => deps.lifecycleService.restart());
      res.json({ restarting: true });
    })
  );

  return router;
}
