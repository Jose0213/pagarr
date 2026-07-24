import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { IDiskScanService } from "../../../media-files-organize/diskScanService.js";
import { FileSystemLookupService } from "./FileSystemLookupService.js";
import type { FileSystemDiskProviderLike } from "./FileSystemLookupService.js";

/**
 * Ported from Readarr.Api.V1/FileSystem/FileSystemController.cs.
 *
 * Real C# controller is a bare `Controller` (three plain `[HttpGet]`
 * actions, no `RestController<T>` base at all) -- hand-built `Router`,
 * same shape as `ManualImportController.ts` in this same task.
 *
 * `IDiskProvider` is narrowed to `FileSystemControllerDiskProviderLike`
 * (`fileExists`/`folderExists`) -- the two members `GetEntityType`/
 * `GetMediaFiles` actually call. `IDiskScanService` is the REAL,
 * already-ported `media-files-organize/diskScanService.ts` (Phase 3,
 * merged) -- not a forward-reference; `getBookFiles(path)` is used
 * directly, matching `_diskScanService.GetBookFiles(path)`.
 */

export interface FileSystemControllerDiskProviderLike extends FileSystemDiskProviderLike {
  fileExists(path: string): boolean;
}

export interface FileSystemControllerOptions {
  diskProvider: FileSystemControllerDiskProviderLike;
  diskScanService: Pick<IDiskScanService, "getBookFiles">;
  /** Optional pre-built lookup service (mainly for tests that want to inject a fake `FileSystemDiskProviderLike`). Defaults to `new FileSystemLookupService(diskProvider)`. */
  fileSystemLookupService?: FileSystemLookupService;
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

export function fileSystemController(options: FileSystemControllerOptions): Router {
  const { diskProvider, diskScanService } = options;
  const fileSystemLookupService =
    options.fileSystemLookupService ?? new FileSystemLookupService(diskProvider);

  const router = Router();

  /** Ported from `FileSystemController.GetContents`. */
  router.get(
    "/",
    asyncHandler((req, res) => {
      const path = asQueryString(req.query["path"]);
      const includeFiles = parseBool(req.query["includeFiles"], false);
      const allowFoldersWithoutTrailingSlashes = parseBool(
        req.query["allowFoldersWithoutTrailingSlashes"],
        false
      );

      const result = fileSystemLookupService.lookupContents(
        path,
        includeFiles,
        allowFoldersWithoutTrailingSlashes
      );
      res.json(result);
    })
  );

  /** Ported from `FileSystemController.GetEntityType`. */
  router.get(
    "/type",
    asyncHandler((req, res) => {
      const path = asQueryString(req.query["path"]) ?? "";

      if (diskProvider.fileExists(path)) {
        res.json({ type: "file" });
        return;
      }

      // Return folder even if it doesn't exist on disk to avoid leaking
      // anything from the UI about the underlying system.
      res.json({ type: "folder" });
    })
  );

  /** Ported from `FileSystemController.GetMediaFiles`. */
  router.get(
    "/mediafiles",
    asyncHandler((req, res) => {
      const path = asQueryString(req.query["path"]) ?? "";

      if (!diskProvider.folderExists(path)) {
        res.json([]);
        return;
      }

      const files = diskScanService.getBookFiles(path);
      res.json(files.map((f) => ({ path: f.fullName, name: f.name })));
    })
  );

  return router;
}
