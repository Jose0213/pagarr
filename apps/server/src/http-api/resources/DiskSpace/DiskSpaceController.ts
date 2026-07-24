import { Router } from "express";
import { stripDefaultId } from "../../rest/RestResource.js";
import type { IDiskSpaceService } from "../../../disk-space/diskSpaceService.js";
import { diskSpacesToResource } from "./DiskSpaceResource.js";

/**
 * Ported from Readarr.Api.V1/DiskSpace/DiskSpaceController.cs.
 *
 * Mounted at `diskspace` (`[V1ApiController("diskspace")]`, an explicit
 * override -- not the default pluralized-lowercase-classname convention
 * every other `[V1ApiController]` controller in this task's scope uses).
 * A plain `Controller`, not `RestController<TResource>` -- the real C#
 * source only ever defines a single `[HttpGet] GetFreeSpace()` action, no
 * REST CRUD verbs at all, so this is a bare Express `Router` with one route
 * rather than going through `restController()` (which would need to mount
 * unused create/update/delete slots this resource genuinely has none of).
 * Since this bypasses `restController()`, `stripDefaultId` (normally
 * applied automatically by that factory) is applied explicitly here so
 * `id: 0` (every `DiskSpaceResource`'s permanent value -- see
 * DiskSpaceResource.ts's doc comment) is omitted from the wire the same
 * way it would be by a real `restController()`-mounted route.
 */
export interface DiskSpaceControllerOptions {
  diskSpaceService: IDiskSpaceService;
}

export function diskSpaceController(options: DiskSpaceControllerOptions): Router {
  const { diskSpaceService } = options;
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(diskSpacesToResource(diskSpaceService.getFreeSpace()).map(stripDefaultId));
  });

  return router;
}
