import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { Author, Edition } from "../../../books/index.js";
import { Quality } from "../../../qualities/quality.js";
import type {
  IManualImportService,
  ManualAuthorLookup,
  ManualBookLookup,
} from "../../../media-files-import/bookImport/manual/manualImportService.js";
import { newManualImportItem } from "../../../media-files-import/bookImport/manual/manualImportItem.js";
import { FilterFilesType } from "../../../media-files-import/filterFilesType.js";
import {
  manualImportItemToResource,
  manualImportItemsToResource,
  type ManualImportResource,
} from "./ManualImportResource.js";
import type { ManualImportUpdateResource } from "./ManualImportUpdateResource.js";

/**
 * Ported from Readarr.Api.V1/ManualImport/ManualImportController.cs.
 *
 * Real C# controller is a bare `Controller` (NOT `RestController<TResource>`
 * -- confirmed by re-reading the source: no `[RestGetById]`/base-class
 * generic at all, just two plain `[HttpGet]`/`[HttpPost]` actions), so this
 * is a hand-built `Router` matching that shape directly rather than going
 * through `restController()`.
 *
 * `IAuthorService`/`IBookService` are narrowed to `ManualAuthorLookup`/
 * `ManualBookLookup` -- the exact same interfaces `ManualImportService`
 * itself (media-files-import/bookImport/manual/manualImportService.ts)
 * already declares for these un-ported services, reused here rather than
 * re-declared, since this controller needs the identical narrow slice
 * (`getAuthor`/`getBook`) for the exact same reason (see that file's own
 * doc comment on the `IAuthorService`/`IBookService` gap).
 *
 * `IEditionService` is narrowed to a LOCAL `ManualImportEditionLookup`
 * instead of reusing `manualImportService.ts`'s own `ManualEditionLookup` --
 * that one intentionally returns only `{ id, foreignEditionId }` (all
 * `ManualImportService.Execute` itself reads off the looked-up edition), but
 * `ManualImportUpdateResource.ToItem`'s assignment (`Edition =
 * _editionService.GetEditionByForeignEditionId(...)`) flows straight into
 * `ManualImportItem.Edition`, a full `Edition`-typed property -- this
 * controller's own call site needs the wider real return shape, so it
 * declares its own narrow interface rather than force a mismatched reuse.
 *
 * `Logger logger` (NLog, injected but never actually called anywhere in the
 * real C# controller body -- verified by re-reading ManualImportController.cs
 * top to bottom, `_logger` is assigned in the ctor and never referenced
 * again) is dropped entirely; preserving an unused constructor parameter
 * has no behavior to port.
 */

/** Ported from the slice of `IEditionService` this controller reads -- see module doc comment on why this isn't `manualImportService.ts`'s own narrower `ManualEditionLookup`. */
export interface ManualImportEditionLookup {
  getEditionByForeignEditionId(foreignEditionId: string): Edition | undefined;
}

export interface ManualImportControllerOptions {
  manualImportService: IManualImportService;
  authorService: ManualAuthorLookup;
  bookService: ManualBookLookup;
  editionService: ManualImportEditionLookup;
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/** Narrows an Express `req.query[...]` value down to a plain string -- see BookFileController.ts's identical `asQueryString` doc comment for why this isn't just `String(value)`. */
function asQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseBool(value: unknown, defaultValue: boolean): boolean {
  const str = asQueryString(value);
  if (str === undefined) {
    return defaultValue;
  }
  return str === "true";
}

/** Ported from `ManualImportController.AddQualityWeight`. */
function addQualityWeight(item: ManualImportResource): ManualImportResource {
  if (item.quality != null) {
    const definition = Quality.DefaultQualityDefinitions.find(
      (d) => d.quality.id === item.quality!.quality.id
    );
    if (!definition) {
      throw new Error("Sequence contains no matching element");
    }

    let weight = definition.weight;
    weight += item.quality.revision.real * 10;
    weight += item.quality.revision.version;
    item.qualityWeight = weight;
  }

  return item;
}

export function manualImportController(options: ManualImportControllerOptions): Router {
  const { manualImportService, authorService, bookService, editionService } = options;

  const router = Router();

  /** Ported from `ManualImportController.GetMediaFiles`. */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const folder = asQueryString(req.query["folder"]);
      const downloadId = asQueryString(req.query["downloadId"]) ?? null;
      const authorIdRaw = asQueryString(req.query["authorId"]);
      const authorId = authorIdRaw !== undefined ? Number.parseInt(authorIdRaw, 10) : undefined;
      const filterExistingFiles = parseBool(req.query["filterExistingFiles"], true);
      const replaceExistingFiles = parseBool(req.query["replaceExistingFiles"], true);

      let author: Author | null = null;
      if (authorId !== undefined && authorId > 0) {
        author = authorService.getAuthor(authorId);
      }

      const filter = filterExistingFiles ? FilterFilesType.Matched : FilterFilesType.None;

      const items = await manualImportService.getMediaFiles(
        folder ?? "",
        downloadId,
        author,
        filter,
        replaceExistingFiles
      );

      const resources = manualImportItemsToResource(items).map(addQualityWeight);
      res.json(resources);
    })
  );

  /** Ported from `ManualImportController.UpdateItems`. */
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const resources = req.body as ManualImportUpdateResource[];
      const items = resources.map((resource) => {
        const item = newManualImportItem();
        item.id = resource.id;
        item.path = resource.path ?? "";
        item.name = resource.name ?? "";
        item.author =
          resource.authorId !== undefined ? authorService.getAuthor(resource.authorId) : undefined;
        item.book =
          resource.bookId !== undefined ? bookService.getBook(resource.bookId) : undefined;
        item.edition =
          resource.foreignEditionId === undefined
            ? undefined
            : editionService.getEditionByForeignEditionId(resource.foreignEditionId);
        item.quality = resource.quality;
        item.releaseGroup = resource.releaseGroup ?? null;
        item.indexerFlags = resource.indexerFlags ?? 0;
        item.downloadId = resource.downloadId ?? null;
        item.additionalFile = resource.additionalFile ?? false;
        item.replaceExistingFiles = resource.replaceExistingFiles ?? false;
        item.disableReleaseSwitching = resource.disableReleaseSwitching ?? false;
        return item;
      });

      const updated = await manualImportService.updateItems(items);
      const result = manualImportItemsToResource(updated);
      res.status(202).json(result);
    })
  );

  return router;
}

// Re-exported for callers that only need the single-item mapper (e.g. tests).
export { manualImportItemToResource };
