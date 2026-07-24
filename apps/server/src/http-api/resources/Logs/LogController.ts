import { Router } from "express";
import { SortDirection } from "../../../db/paging-spec.js";
import type { FilterExpression } from "../../../db/filter.js";
import type { Log } from "../../../instrumentation/log.js";
import type { LogService } from "../../../instrumentation/logService.js";
import {
  applyToPage,
  buildPagingResource,
  mapToPagingSpec,
  parsePagingRequest,
} from "../../rest/Paging.js";
import { logToResource } from "./LogResource.js";
import type { LogResource } from "./LogResource.js";

/**
 * Ported from Readarr.Api.V1/Logs/LogController.cs. Mounted at `log`
 * (default `[V1ApiController]` route -- lowercased class name minus
 * "Controller").
 *
 * ## `level` cumulative-severity filter -- ported literally
 *
 * Each `level` value adds ALL MORE-SEVERE levels to the filter too (e.g.
 * `level=warn` matches Fatal OR Error OR Warn -- NOT "warn and only warn"),
 * exactly matching the real C# `switch` statement's cumulative
 * `FilterExpressions.Add(h => h.Level == "Fatal" || h.Level == "Error" ...)`
 * pattern for each case. An unrecognized/absent `level` value applies no
 * filter at all (the real `switch` has no `default` arm).
 *
 * ## `sortKey` remap: `"time"` <-> `"id"` -- ported literally, including
 * the reason
 *
 * `pageSpec.SortKey == "time"` gets remapped to `"id"` BEFORE the paged
 * query runs (`Log.Id` is an autoincrement column that sorts identically
 * to `Log.Time` for this table -- the DB doesn't have a `Time` index, `Id`
 * does), then the RESPONSE's `SortKey` is remapped back to `"time"` after
 * the query, purely so the API's OWN "did I ask to sort by time" contract
 * with its caller stays consistent even though the underlying query
 * physically sorted by `Id`. Ported as-is, in both directions, at both
 * points in the method body.
 */
export interface LogControllerOptions {
  logService: LogService;
}

export function logController(options: LogControllerOptions): Router {
  const { logService } = options;
  const router = Router();

  router.get("/", (req, res) => {
    const pagingRequest = parsePagingRequest(req);
    const pagingResource = buildPagingResource<LogResource>(pagingRequest);
    // Ported from `pagingResource.MapToPagingSpec<LogResource, Log>()` --
    // no explicit defaultSortKey/defaultSortDirection args at this call
    // site, so both fall back to MapToPagingSpec's own real defaults
    // ("Id"/Ascending).
    const pageSpec = mapToPagingSpec<LogResource, Log>(
      pagingResource,
      "id",
      SortDirection.Ascending
    );

    // Ported: `if (pageSpec.SortKey == "time") { pageSpec.SortKey = "id"; }`
    if (pageSpec.sortKey === "time") {
      pageSpec.sortKey = "id";
    }

    const level = typeof req.query["level"] === "string" ? req.query["level"] : "";
    if (level.trim() !== "") {
      const filter = buildLevelFilter(level);
      if (filter) {
        pageSpec.filterExpressions.push(filter);
      }
    }

    const response = applyToPage(pageSpec, (spec) => logService.paged(spec), logToResource);

    // Ported: `if (pageSpec.SortKey == "id") { response.SortKey = "time"; }`
    // -- note this checks pageSpec (the query-time value, potentially just
    // remapped above), not response.SortKey, matching the real source's own
    // (slightly redundant-looking, preserved as-is) check.
    if (pageSpec.sortKey === "id") {
      response.sortKey = "time";
    }

    res.json(response);
  });

  return router;
}

/** Ported from the real `switch (level)` block's cumulative-severity filter construction. */
function buildLevelFilter(level: string): FilterExpression<Log> | null {
  const cumulativeLevels: Record<string, string[]> = {
    fatal: ["Fatal"],
    error: ["Fatal", "Error"],
    warn: ["Fatal", "Error", "Warn"],
    info: ["Fatal", "Error", "Warn", "Info"],
    debug: ["Fatal", "Error", "Warn", "Info", "Debug"],
    trace: ["Fatal", "Error", "Warn", "Info", "Debug", "Trace"],
  };

  const levels = cumulativeLevels[level];
  if (!levels) {
    return null;
  }

  return {
    or: levels.map((l) => ({ field: "level", op: "eq", value: l })),
  };
}
