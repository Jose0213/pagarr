import { Router } from "express";
import type { IQueueService } from "../../../queue/queueService.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import { toQueueResource } from "./QueueResource.js";
import type { PendingReleaseServiceLike } from "./QueueController.js";

/**
 * Ported from Readarr.Api.V1/Queue/QueueDetailsController.cs. Mounted at
 * `/queue/details` (the real `[V1ApiController("queue/details")]` route
 * base).
 */
export interface QueueDetailsControllerOptions {
  queueService: IQueueService;
  pendingReleaseService: PendingReleaseServiceLike;
  resolveQualityProfile: (authorId: number | undefined) => QualityProfile | undefined;
}

function parseIntQueryParam(raw: unknown): number | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Ported from `[FromQuery] List<int> bookIds` model binding: repeated `bookIds=1&bookIds=2` or a single value, matching ASP.NET's default collection binder for a query-string array. */
function parseIntListQueryParam(raw: unknown): number[] {
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isInteger(v));
}

export function queueDetailsController(options: QueueDetailsControllerOptions): Router {
  const { queueService, pendingReleaseService, resolveQualityProfile } = options;

  const router = Router();

  // ---- GET / ----------------------------------------------------------
  router.get("/", (req, res) => {
    const authorId = parseIntQueryParam(req.query["authorId"]);
    const bookIds = parseIntListQueryParam(req.query["bookIds"]);
    const includeAuthor =
      req.query["includeAuthor"] === "true" || req.query["includeAuthor"] === "1";
    const includeBook = req.query["includeBook"] !== "false" && req.query["includeBook"] !== "0";

    const queue = queueService.getQueue();
    const pending = pendingReleaseService.getPendingQueue();
    const fullQueue = [...queue, ...pending];

    let filtered = fullQueue;
    if (authorId !== undefined) {
      filtered = fullQueue.filter((q) => q.author?.id === authorId);
    } else if (bookIds.length > 0) {
      filtered = fullQueue.filter((q) => q.book !== null && bookIds.includes(q.book.id));
    }

    const resources = filtered.map((q) =>
      toQueueResource(q, includeAuthor, includeBook, resolveQualityProfile(q.author?.id))
    );

    res.json(resources);
  });

  return router;
}
