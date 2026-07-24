import { Router, type Request } from "express";
import type { Author } from "../../../books/models.js";
import type { EntityHistory } from "../../../history/entityHistory.js";
import { EntityHistoryEventType } from "../../../history/entityHistory.js";
import type { IHistoryService } from "../../../history/historyService.js";
import type { CustomFormatCalculationService } from "../../../custom-formats/customFormatCalculationService.js";
import type { IUpgradableSpecification } from "../../../decision-engine/specifications/upgradableSpecification.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import type { IFailedDownloadService } from "../../../download-tracking/failedDownloadService.js";
import { PagingSpec, SortDirection } from "../../../db/paging-spec.js";
import {
  parsePagingRequest,
  buildPagingResource,
  mapToPagingSpec,
  applyToPage,
  type PagingResource,
} from "../../rest/Paging.js";
import {
  toHistoryResource,
  authorToResource,
  bookToResource,
  type HistoryResource,
} from "./HistoryResource.js";

/**
 * Ported from Readarr.Api.V1/History/HistoryController.cs. Mounted at
 * `/history` (the real `[V1ApiController]` default route -- derived from
 * the controller's own class name minus the "Controller" suffix,
 * lowercased, per this port's established explicit-route-base convention
 * for `[V1ApiController]`-with-no-argument controllers).
 */

/** Narrowed to the one method this controller calls -- matches `books/authorService.ts`'s real `AuthorService.getAuthor`. */
export interface AuthorLookup {
  getAuthor(authorId: number): Author;
}

export interface HistoryControllerOptions {
  historyService: IHistoryService;
  formatCalculator: CustomFormatCalculationService;
  upgradableSpecification: IUpgradableSpecification;
  failedDownloadService: IFailedDownloadService;
  authorService: AuthorLookup;
  /** Resolves the `QualityProfile` for an author id, for `qualityCutoffNotMet`. Same shape as QueueController.ts's `resolveQualityProfile`. */
  resolveQualityProfile: (authorId: number) => QualityProfile | undefined;
}

function parseBoolQueryParam(req: Request, name: string, defaultValue: boolean): boolean {
  const raw = req.query[name];
  if (raw === undefined) {
    return defaultValue;
  }
  return raw === "true" || raw === "1";
}

function parseIntQueryParam(raw: unknown): number | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Ported from `[FromQuery(Name = "eventType")] int[] eventTypes` model binding. */
function parseEventTypesQueryParam(raw: unknown): EntityHistoryEventType[] {
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isInteger(v));
}

function parseEventTypeQueryParam(raw: unknown): EntityHistoryEventType | null {
  if (typeof raw !== "string") {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/** Ported from `HistoryController` factory. */
export function historyController(options: HistoryControllerOptions): Router {
  const {
    historyService,
    formatCalculator,
    upgradableSpecification,
    failedDownloadService,
    authorService,
    resolveQualityProfile,
  } = options;

  /**
   * Ported from `HistoryController.MapToResource(EntityHistory model, bool
   * includeAuthor, bool includeBook)`.
   *
   * `model.Author` in the real C# source may already be hydrated (joined by
   * `GetByAuthor`/`Since`/`FindByDownloadId`) or null (the plain `Paged`
   * listing's rows, per historyRepository.ts's own doc comment on which
   * methods join). This port's `formatCalculator.parseCustomFormatForHistory`
   * requires a real `Author`, so this always resolves one via
   * `authorService.getAuthor(model.authorId)` when not already attached --
   * matches the real behavior for every call site EXCEPT ids that don't
   * resolve to a real author (both this port's `authorService.getAuthor`
   * and the real C# `IAuthorService.GetAuthor` throw
   * `ModelNotFoundException`/similar on an unknown id either way, so this
   * doesn't introduce a new failure mode).
   */
  function mapToResource(
    model: EntityHistory,
    includeAuthor: boolean,
    includeBook: boolean
  ): HistoryResource {
    const author = model.author ?? authorService.getAuthor(model.authorId);

    const customFormats = formatCalculator.parseCustomFormatForHistory(model, author);
    const qualityProfile = resolveQualityProfile(model.authorId);
    const customFormatScore = qualityProfile
      ? qualityProfile.formatItems
          .filter((x) => customFormats.some((f) => f.id === x.format.id))
          .reduce((sum, x) => sum + x.score, 0)
      : 0;

    const resource = toHistoryResource(model, customFormats, customFormatScore);

    if (includeAuthor) {
      resource.author = authorToResource(author);
    }

    if (includeBook && model.book) {
      resource.book = bookToResource(model.book);
    }

    if (qualityProfile) {
      resource.qualityCutoffNotMet = upgradableSpecification.qualityCutoffNotMet(
        qualityProfile,
        model.quality
      );
    }

    return resource;
  }

  const router = Router();

  // ---- GET /since --------------------------------------------------------
  // Mounted BEFORE "/" so a literal "since"/"author"/"failed/:id" path
  // segment never collides with a paging-only "/" route (Express matches
  // these as distinct routes regardless of mount order here since "/" has
  // no wildcard segment, but mounted first for readability/parity with the
  // real controller's declared method order).
  router.get("/since", (req, res, next) => {
    try {
      const dateRaw = req.query["date"];
      if (typeof dateRaw !== "string") {
        throw new Error("date query parameter is required");
      }
      const date = new Date(dateRaw).toISOString();
      const eventType = parseEventTypeQueryParam(req.query["eventType"]);
      const includeAuthor = parseBoolQueryParam(req, "includeAuthor", false);
      const includeBook = parseBoolQueryParam(req, "includeBook", false);

      const resources = historyService
        .since(date, eventType)
        .map((h) => mapToResource(h, includeAuthor, includeBook));

      res.json(resources);
    } catch (err) {
      next(err);
    }
  });

  // ---- GET /author --------------------------------------------------------
  router.get("/author", (req, res, next) => {
    try {
      const authorId = parseIntQueryParam(req.query["authorId"]);
      if (authorId === undefined) {
        throw new Error("authorId query parameter is required");
      }
      const bookId = parseIntQueryParam(req.query["bookId"]);
      const eventType = parseEventTypeQueryParam(req.query["eventType"]);
      const includeAuthor = parseBoolQueryParam(req, "includeAuthor", false);
      const includeBook = parseBoolQueryParam(req, "includeBook", false);

      const author = authorService.getAuthor(authorId);

      const items =
        bookId !== undefined
          ? historyService.getByBook(bookId, eventType)
          : historyService.getByAuthor(authorId, eventType);

      const resources = items.map((h) => {
        const stamped: EntityHistory = { ...h, author };
        return mapToResource(stamped, includeAuthor, includeBook);
      });

      res.json(resources);
    } catch (err) {
      next(err);
    }
  });

  // ---- POST /failed/:id ----------------------------------------------------
  router.post("/failed/:id", (req, res, next) => {
    try {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      failedDownloadService.markAsFailedByHistoryId(id);
      res.json({});
    } catch (err) {
      next(err);
    }
  });

  // ---- GET / ----------------------------------------------------------
  router.get("/", (req, res, next) => {
    void (async () => {
      try {
        const includeAuthor = parseBoolQueryParam(req, "includeAuthor", false);
        const includeBook = parseBoolQueryParam(req, "includeBook", false);
        const eventTypes = parseEventTypesQueryParam(req.query["eventType"]);
        const bookId = parseIntQueryParam(req.query["bookId"]);
        const downloadId =
          typeof req.query["downloadId"] === "string" ? req.query["downloadId"] : undefined;

        const pagingRequest = parsePagingRequest(req);
        const pagingResource = buildPagingResource<HistoryResource>(pagingRequest);
        const pagingSpec = mapToPagingSpec<HistoryResource, EntityHistory>(
          pagingResource,
          "date",
          SortDirection.Descending
        );

        if (eventTypes.length > 0) {
          pagingSpec.filterExpressions.push({ field: "eventType", op: "in", value: eventTypes });
        }

        if (bookId !== undefined) {
          pagingSpec.filterExpressions.push({ field: "bookId", op: "eq", value: bookId });
        }

        if (downloadId !== undefined && downloadId.trim() !== "") {
          pagingSpec.filterExpressions.push({ field: "downloadId", op: "eq", value: downloadId });
        }

        const envelope: PagingResource<HistoryResource> = applyToPage(
          pagingSpec,
          (spec) => historyService.paged(spec),
          (h) => mapToResource(h, includeAuthor, includeBook)
        );

        res.json(envelope);
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}

export { PagingSpec };
