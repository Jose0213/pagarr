import { Router, type Request } from "express";
import type { QueueItem } from "../../../queue/queue.js";
import type { IQueueService } from "../../../queue/queueService.js";
import { TimeleftComparer } from "../../../queue/timeleftComparer.js";
import { EstimatedCompletionTimeComparer } from "../../../queue/estimatedCompletionTimeComparer.js";
import { QualityModelComparer } from "../../../qualities/qualityModelComparer.js";
import {
  asQualityProfileLike,
  type QualityProfile,
} from "../../../profiles/qualities/qualityProfile.js";
import type { RemoteBook } from "../../../parser/model/remoteBook.js";
import type { IProvideDownloadClient } from "../../../download-clients/index.js";
import type { ITrackedDownloadService } from "../../../download-tracking/tracked-downloads/trackedDownloadService.js";
import type { TrackedDownload } from "../../../download-tracking/tracked-downloads/trackedDownload.js";
import type { IFailedDownloadService } from "../../../download-tracking/failedDownloadService.js";
import type { IIgnoredDownloadService } from "../../../download-tracking/ignoredDownloadService.js";
import { NotFoundException } from "../../rest/NotFoundException.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import { PagingSpec, SortDirection } from "../../../db/paging-spec.js";
import {
  parsePagingRequest,
  buildPagingResource,
  mapToPagingSpec,
  type PagingResource,
} from "../../rest/Paging.js";
import { toQueueResource, type QueueResource } from "./QueueResource.js";
import type { QueueBulkResource } from "./QueueBulkResource.js";

/**
 * Ported from Readarr.Api.V1/Queue/QueueController.cs.
 *
 * ## Why a plain factory, not `restController()`
 *
 * The real `QueueController : RestControllerWithSignalR<QueueResource,
 * Queue>` -- but every one of its base-CRUD hooks is either dead
 * (`GetResourceById` throws `NotImplementedException`, this controller never
 * calls it directly since `RemoveAction` fetches via `_queueService.Find` +
 * `GetTrackedDownload` instead) or absent (no `create`/`update`). The only
 * REAL routes this controller mounts beyond its custom `GetQueue`/
 * `RemoveAction`/`RemoveMany` are `[RestDeleteById]` (DELETE /:id, WITH id
 * validation) -- `restController()`'s `delete` option handles that one
 * faithfully; the rest (`GET /`, `DELETE /bulk`) are custom routes this
 * module wires directly, matching how `ProviderControllerBase.ts` layers
 * its own extra routes on top of `restController()`'s base ones.
 *
 * SignalR broadcasting (`IHandle<QueueUpdatedEvent>`/
 * `IHandle<PendingReleasesUpdatedEvent>` -> `BroadcastResourceChange(
 * ModelAction.Sync)`) is NOT wired up by this module -- both real C# events
 * originate from `QueueService`/`PendingReleaseService` internals this
 * worktree's scope doesn't own the publishing side of (`queue/queueService.ts`'s
 * `QueueUpdatedEvent` publish, `PendingReleaseService`'s
 * `onPendingReleasesUpdated` callback). A caller composing this router with
 * the real `EventAggregator`/`SignalRBroadcaster` can subscribe to both
 * events and call `signalRBroadcaster.broadcastResourceChange(ModelAction.Sync,
 * "queue")` directly -- there is no per-id resource-change payload to build
 * (matches the real `Handle` methods' unconditional resourceless broadcast),
 * so `restControllerWithSignalR()`'s generic per-id wiring doesn't apply
 * here and a bespoke wrapper would add no value over that one-line
 * subscription at the composition root.
 */

export interface QueueControllerOptions {
  queueService: IQueueService;
  pendingReleaseService: PendingReleaseServiceLike;
  /** Ported from the ctor's `qualityProfileService.GetDefaultProfile(string.Empty)` -- the fixed comparer profile used for the `sortKey=quality` branch only. */
  qualityProfileService: { getDefaultProfile(name: string): QualityProfile };
  trackedDownloadService: ITrackedDownloadService;
  failedDownloadService: IFailedDownloadService;
  ignoredDownloadService: IIgnoredDownloadService;
  downloadClientProvider: IProvideDownloadClient;
  blocklistService: BlockPendingReleaseLike;
  /** Resolves the `QualityProfile` for a queue item's author (or `undefined`), for `QueueResource.customFormatScore`. See QueueResource.ts's `toQueueResource` doc comment. */
  resolveQualityProfile: (authorId: number | undefined) => QualityProfile | undefined;
}

/** Narrowed to the methods QueueController/QueueDetailsController/QueueStatusController call -- matches `download-tracking/pending/pendingReleaseService.ts`'s real `PendingReleaseService` surface. */
export interface PendingReleaseServiceLike {
  findPendingQueueItem(id: number): QueueItem | undefined;
  getPendingQueue(): QueueItem[];
  removePendingQueueItems(queueId: number): void;
}

/**
 * Narrowed to the one `IBlocklistService` method this controller calls
 * (`Block`), typed against Parser's real `RemoteBook` -- matching
 * `QueueItem.remoteBook`'s own type (`queue/queue.ts`). See
 * QueueActionController.ts's `DownloadReportLike` doc comment for the full
 * explanation of why: this worktree's already-merged
 * `blocklisting/blocklistService.ts` `IBlocklistService.block(remoteBook,
 * message)` takes DecisionEngine's stricter forward-ref `RemoteBook`
 * instead (non-nullable `author`/`release`/`parsedBookInfo`), the same
 * Parser-vs-DecisionEngine split documented in
 * `download-tracking/pending/pendingReleaseService.ts`'s header comment.
 * Wiring this controller to the real `BlocklistService.block` needs the
 * same kind of DecisionEngine-bridge adapter that module's own
 * `insertFromDecision` already demonstrates, not a new type on either side.
 */
export interface BlockPendingReleaseLike {
  block(remoteBook: RemoteBook, message: string): void;
}

/** Ported from `QueueController.GetOrderByFunc`'s default/fallback branches plus every named-field branch except the four handled by dedicated comparers below. */
function getOrderByFunc(sortKey: string | null): (q: QueueItem) => unknown {
  switch (sortKey) {
    case "status":
      return (q) => q.status;
    case "authors.sortName":
      return (q) => q.author?.metadata?.sortName ?? q.title;
    case "authors.sortNameLastFirst":
      return (q) => q.author?.metadata?.sortNameLastFirst ?? "";
    case "title":
      return (q) => q.title;
    case "book":
      return (q) => q.book;
    case "book.title":
      return (q) => q.book?.title ?? "";
    case "book.releaseDate":
      return (q) => q.book?.releaseDate ?? "";
    case "size":
      return (q) => q.size;
    case "progress":
      // Ported: "Avoid exploding if a download's size is 0" -- `100 -
      // (Sizeleft / Math.Max(Size * 100, 1))`.
      return (q) => 100 - q.sizeleft / Math.max(q.size * 100, 1);
    default:
      return (q) => q.timeleft;
  }
}

function compareBy<T>(getKey: (item: T) => unknown, ascending: boolean) {
  return (a: T, b: T): number => {
    const av = getKey(a);
    const bv = getKey(b);
    let result: number;
    if (av === bv) {
      result = 0;
    } else if (av === null || av === undefined) {
      result = -1;
    } else if (bv === null || bv === undefined) {
      result = 1;
    } else if (av > bv) {
      result = 1;
    } else if (av < bv) {
      result = -1;
    } else {
      result = 0;
    }
    return ascending ? result : -result;
  };
}

/**
 * Ported from `QueueController.GetQueue(PagingSpec<Queue>, bool
 * includeUnknownAuthorItems)`: filters, concatenates pending, sorts
 * (dedicated comparers for timeleft/estimatedCompletionTime/quality, plain
 * field comparers otherwise -- protocol/indexer/downloadClient use
 * case-insensitive string comparison per the real `StringComparer.
 * InvariantCultureIgnoreCase`), THEN a secondary `ThenByDescending` on
 * download progress percentage, pages, and (ported quirk, preserved
 * faithfully) re-pages once more at a clamped page number if the requested
 * page came back empty and wasn't page 1 -- matches the real C# source's
 * post-hoc "page out of range" recovery exactly, including its
 * `TotalRecords / PageSize` (not `PageSize - 1`) off-by-one-prone ceiling
 * math.
 */
function buildQueuePage(
  pagingSpec: PagingSpec<QueueItem>,
  fullQueue: QueueItem[],
  qualityComparer: QualityModelComparer
): PagingSpec<QueueItem> {
  const ascending = pagingSpec.sortDirection === SortDirection.Ascending;
  const sortKey = pagingSpec.sortKey;

  let compareFn: (a: QueueItem, b: QueueItem) => number;

  if (sortKey === "timeleft") {
    const c = new TimeleftComparer();
    compareFn = (a, b) =>
      ascending ? c.compare(a.timeleft, b.timeleft) : c.compare(b.timeleft, a.timeleft);
  } else if (sortKey === "estimatedCompletionTime") {
    const c = new EstimatedCompletionTimeComparer();
    compareFn = (a, b) =>
      ascending
        ? c.compare(a.estimatedCompletionTime, b.estimatedCompletionTime)
        : c.compare(b.estimatedCompletionTime, a.estimatedCompletionTime);
  } else if (sortKey === "protocol") {
    compareFn = compareBy((q) => q.protocol, ascending);
  } else if (sortKey === "indexer") {
    compareFn = (a, b) => {
      const result = a.indexer.toLowerCase().localeCompare(b.indexer.toLowerCase());
      return ascending ? result : -result;
    };
  } else if (sortKey === "downloadClient") {
    compareFn = (a, b) => {
      const result = (a.downloadClient ?? "")
        .toLowerCase()
        .localeCompare((b.downloadClient ?? "").toLowerCase());
      return ascending ? result : -result;
    };
  } else if (sortKey === "quality") {
    compareFn = (a, b) =>
      ascending
        ? qualityComparer.compare(a.quality, b.quality)
        : qualityComparer.compare(b.quality, a.quality);
  } else {
    compareFn = compareBy(getOrderByFunc(sortKey), ascending);
  }

  const ordered = [...fullQueue].sort(compareFn);

  // Ported: `.ThenByDescending(q => q.Size == 0 ? 0 : 100 - (q.Sizeleft / q.Size * 100))`.
  const progressOf = (q: QueueItem): number =>
    q.size === 0 ? 0 : 100 - (q.sizeleft / q.size) * 100;
  ordered.sort((a, b) => {
    const primary = compareFn(a, b);
    if (primary !== 0) {
      return primary;
    }
    return progressOf(b) - progressOf(a);
  });

  const pageOf = (page: number): QueueItem[] =>
    ordered.slice(
      (page - 1) * pagingSpec.pageSize,
      (page - 1) * pagingSpec.pageSize + pagingSpec.pageSize
    );

  pagingSpec.records = pageOf(pagingSpec.page);
  pagingSpec.totalRecords = fullQueue.length;

  if (pagingSpec.records.length === 0 && pagingSpec.page > 1) {
    pagingSpec.page = Math.max(Math.ceil(pagingSpec.totalRecords / pagingSpec.pageSize), 1);
    pagingSpec.records = pageOf(pagingSpec.page);
  }

  return pagingSpec;
}

/** Ported from the private `Remove(Queue pendingRelease)`. */
function removePending(
  pendingRelease: QueueItem,
  pendingReleaseService: PendingReleaseServiceLike,
  blocklistService: BlockPendingReleaseLike
): void {
  if (pendingRelease.remoteBook) {
    blocklistService.block(pendingRelease.remoteBook, "Pending release manually blocklisted");
  }
  pendingReleaseService.removePendingQueueItems(pendingRelease.id);
}

/**
 * Ported from the private `Remove(TrackedDownload, bool, bool, bool, bool)`.
 * Returns the tracked download to stop-tracking, or `null` if it was left
 * alone (ported: the ignore-download branch returning false means "not
 * actually removed").
 *
 * NOTE on the real C# `if (downloadClient == null) throw new
 * BadRequestException();` null-check: this port's `IProvideDownloadClient.get(id)`
 * (download-clients/DownloadClientProvider.ts) -- like the real C#
 * `DownloadClientProvider.Get(int id)`'s own `.Single(...)` -- never
 * actually RETURNS null on a missing id; both throw instead (`.Single()`
 * throws `InvalidOperationException` in C#, this port's `get()` throws a
 * plain `Error`). The null-check is dead code in the original for the same
 * reason it would be dead code here, so it's omitted rather than guarding
 * against a case the injected `get()`'s own type signature already rules
 * out; a missing download client still surfaces as an error (500, not the
 * intended 400) exactly as it would in the real app, and this deviation is
 * confined to that one edge case.
 */
async function removeTracked(
  trackedDownload: TrackedDownload,
  removeFromClient: boolean,
  blocklist: boolean,
  skipRedownload: boolean,
  changeCategory: boolean,
  deps: {
    downloadClientProvider: IProvideDownloadClient;
    failedDownloadService: IFailedDownloadService;
    ignoredDownloadService: IIgnoredDownloadService;
  }
): Promise<TrackedDownload | null> {
  if (removeFromClient) {
    const downloadClient = deps.downloadClientProvider.get(trackedDownload.downloadClient);
    await downloadClient.removeItem(trackedDownload.downloadItem, true);
  } else if (changeCategory) {
    const downloadClient = deps.downloadClientProvider.get(trackedDownload.downloadClient);
    await downloadClient.markItemAsImported(trackedDownload.downloadItem);
  }

  if (blocklist) {
    deps.failedDownloadService.markAsFailedByDownloadId(
      trackedDownload.downloadItem.downloadId,
      skipRedownload
    );
  }

  if (!removeFromClient && !blocklist && !changeCategory) {
    if (!deps.ignoredDownloadService.ignoreDownload(trackedDownload)) {
      return null;
    }
  }

  return trackedDownload;
}

/** Ported from the private `GetTrackedDownload(int queueId)`. Throws `NotFoundException` (matching both real branches -- an unknown queue id, and a queue id with no live tracked download). */
function getTrackedDownload(
  queueId: number,
  queueService: IQueueService,
  trackedDownloadService: ITrackedDownloadService
): TrackedDownload {
  const queueItem = queueService.find(queueId);
  if (!queueItem) {
    throw new NotFoundException();
  }

  if (!queueItem.downloadId) {
    throw new NotFoundException();
  }

  const trackedDownload = trackedDownloadService.find(queueItem.downloadId);
  if (!trackedDownload) {
    throw new NotFoundException();
  }

  return trackedDownload;
}

function parseBoolQueryParam(req: Request, name: string, defaultValue: boolean): boolean {
  const raw = req.query[name];
  if (raw === undefined) {
    return defaultValue;
  }
  return raw === "true" || raw === "1";
}

/** Ported from `QueueController`. Mounted at `/queue`. */
export function queueController(options: QueueControllerOptions): Router {
  const {
    queueService,
    pendingReleaseService,
    qualityProfileService,
    trackedDownloadService,
    failedDownloadService,
    ignoredDownloadService,
    downloadClientProvider,
    blocklistService,
    resolveQualityProfile,
  } = options;

  const qualityComparerProfile = asQualityProfileLike(qualityProfileService.getDefaultProfile(""));
  const qualityComparer = new QualityModelComparer(qualityComparerProfile);

  const router = Router();

  // ---- GET / ----------------------------------------------------------
  router.get("/", (req, res, next) => {
    try {
      const includeUnknownAuthorItems = parseBoolQueryParam(
        req,
        "includeUnknownAuthorItems",
        false
      );
      const includeAuthor = parseBoolQueryParam(req, "includeAuthor", false);
      const includeBook = parseBoolQueryParam(req, "includeBook", false);

      const pagingRequest = parsePagingRequest(req);
      const pagingResource = buildPagingResource<QueueResource>(pagingRequest);
      const pagingSpec = mapToPagingSpec<QueueResource, QueueItem>(
        pagingResource,
        "timeleft",
        SortDirection.Ascending
      );

      const queue = queueService.getQueue();
      const filteredQueue = includeUnknownAuthorItems
        ? queue
        : queue.filter((q) => q.author !== null);
      const pending = pendingReleaseService.getPendingQueue();
      const fullQueue = [...filteredQueue, ...pending];

      buildQueuePage(pagingSpec, fullQueue, qualityComparer);

      const envelope: PagingResource<QueueResource> = {
        page: pagingSpec.page,
        pageSize: pagingSpec.pageSize,
        sortKey: pagingSpec.sortKey,
        sortDirection: pagingSpec.sortDirection,
        totalRecords: pagingSpec.totalRecords,
        records: pagingSpec.records.map((q) =>
          toQueueResource(q, includeAuthor, includeBook, resolveQualityProfile(q.author?.id))
        ),
      };

      res.json(envelope);
    } catch (err) {
      next(err);
    }
  });

  // ---- DELETE /bulk ----------------------------------------------------
  // Mounted BEFORE "/:id" so Express doesn't treat "bulk" as an :id value.
  router.delete("/bulk", (req, res, next) => {
    void (async () => {
      try {
        const resource = req.body as QueueBulkResource;
        const removeFromClient = parseBoolQueryParam(req, "removeFromClient", true);
        const blocklist = parseBoolQueryParam(req, "blocklist", false);
        const skipRedownload = parseBoolQueryParam(req, "skipRedownload", false);
        const changeCategory = parseBoolQueryParam(req, "changeCategory", false);

        const trackedDownloadIds: string[] = [];
        const pendingToRemove: QueueItem[] = [];
        const trackedToRemove: TrackedDownload[] = [];

        for (const id of resource.ids) {
          const pendingRelease = pendingReleaseService.findPendingQueueItem(id);
          if (pendingRelease) {
            pendingToRemove.push(pendingRelease);
            continue;
          }

          const trackedDownload = tryGetTrackedDownload(id, queueService, trackedDownloadService);
          if (trackedDownload) {
            trackedToRemove.push(trackedDownload);
          }
        }

        for (const pendingRelease of distinctBy(pendingToRemove, (p) => p.id)) {
          removePending(pendingRelease, pendingReleaseService, blocklistService);
        }

        for (const trackedDownload of distinctBy(
          trackedToRemove,
          (t) => t.downloadItem.downloadId
        )) {
          await removeTracked(
            trackedDownload,
            removeFromClient,
            blocklist,
            skipRedownload,
            changeCategory,
            {
              downloadClientProvider,
              failedDownloadService,
              ignoredDownloadService,
            }
          );
          trackedDownloadIds.push(trackedDownload.downloadItem.downloadId);
        }

        trackedDownloadService.stopTrackingMany(trackedDownloadIds);

        res.json({});
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- DELETE /:id (RestDeleteById -- WITH id validation) -----------------
  router.delete("/:id", (req, res, next) => {
    void (async () => {
      try {
        const id = Number.parseInt(req.params["id"] ?? "", 10);
        if (!(Number.isInteger(id) && id > 0)) {
          throw new BadRequestException(`${id} is not a valid ID`);
        }

        const removeFromClient = parseBoolQueryParam(req, "removeFromClient", true);
        const blocklist = parseBoolQueryParam(req, "blocklist", false);
        const skipRedownload = parseBoolQueryParam(req, "skipRedownload", false);
        const changeCategory = parseBoolQueryParam(req, "changeCategory", false);

        const pendingRelease = pendingReleaseService.findPendingQueueItem(id);
        if (pendingRelease) {
          removePending(pendingRelease, pendingReleaseService, blocklistService);
          res.json({});
          return;
        }

        const trackedDownload = getTrackedDownload(id, queueService, trackedDownloadService);

        await removeTracked(
          trackedDownload,
          removeFromClient,
          blocklist,
          skipRedownload,
          changeCategory,
          {
            downloadClientProvider,
            failedDownloadService,
            ignoredDownloadService,
          }
        );
        trackedDownloadService.stopTracking(trackedDownload.downloadItem.downloadId);

        res.json({});
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}

/** Ported from `RemoveMany`'s inline `GetTrackedDownload`-equivalent lookup: unlike the single-item `RemoveAction`, the bulk path silently skips ids with no live tracked download instead of throwing (matches the real C# `RemoveMany`'s `if (trackedDownload != null) { ... }` guard, no NotFoundException). */
function tryGetTrackedDownload(
  queueId: number,
  queueService: IQueueService,
  trackedDownloadService: ITrackedDownloadService
): TrackedDownload | undefined {
  const queueItem = queueService.find(queueId);
  if (!queueItem || !queueItem.downloadId) {
    return undefined;
  }
  return trackedDownloadService.find(queueItem.downloadId);
}

function distinctBy<T, K>(items: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
