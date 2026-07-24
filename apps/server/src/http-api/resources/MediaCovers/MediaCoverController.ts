import { join } from "node:path";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

/**
 * Ported from Readarr.Api.V1/MediaCovers/MediaCoverController.cs.
 *
 * ## Binary-file-serving, not JSON -- the first non-JSON response in Phase 5
 *
 * The real C# actions return `PhysicalFileResult` (`Controller.PhysicalFile
 * (filePath, contentType)`), an ASP.NET result type that streams a file off
 * disk directly to the response with the given `Content-Type` header and
 * (by default) `Content-Length` + conditional-GET support (ETag/Last-Modified,
 * via `PhysicalFileResult`'s underlying `FileStreamResult` machinery -- not
 * itself something this port's minimal composition root
 * (`http-api/rest/RestController.ts`/`RestControllerWithSignalR.ts`) has ANY
 * concept of, since every route those factories mount always writes JSON via
 * `res.json(...)`). This port uses Express's own built-in `res.sendFile()`
 * (backed by the `send` package, the same battle-tested static-file-serving
 * primitive `express.static()` itself uses) as the direct equivalent:
 * range/conditional-GET support included for free, no extra composition-root
 * capability needed. This is NOT built on `restController()`/
 * `restControllerWithSignalR()` at all -- there is no JSON resource shape
 * here for that factory's `TResource extends RestResource` constraint to
 * even apply to; this is a hand-built two-route `Router`, matching the real
 * C# controller's own shape (bare `Controller`, not `RestController<T>`).
 *
 * ## Content-type resolution -- narrow map, not a new `mime-types` dependency
 *
 * C#'s `_mimeTypeProvider` is `Microsoft.AspNetCore.StaticFiles.
 * FileExtensionContentTypeProvider`, a large built-in extension->MIME table
 * covering hundreds of file types, falling back to `application/octet-stream`
 * for anything unrecognized. Both real routes' own path templates are
 * regex-constrained to `.(jpg|png|gif)$` ONLY (`RegexResizedImage`'s route
 * attribute, `{filename:regex((.+)\.(jpg|png|gif))}`) -- no other extension
 * can ever reach `GetContentType` in the first place. Rather than pull in
 * `mime-types` (present only transitively via `express`'s own `send`
 * dependency, not a direct dependency of this package) for a lookup that
 * only ever needs to resolve 3 known extensions, `CONTENT_TYPES` below is a
 * small explicit map covering exactly those three (plus the same
 * `application/octet-stream` fallback C#'s provider uses for anything
 * unmatched, preserved for faithfulness even though it's currently
 * unreachable given the route regex).
 *
 * ## `IAppFolderInfo`/`IDiskProvider` -- same narrowed-interface convention
 * as `media-cover/mediaCoverService.ts`
 *
 * `coverRootFolder` (resolved `AppFolderInfo.GetAppDataPath() + "MediaCover"`)
 * and `MediaCoverControllerDiskProviderLike` (`fileExists`/`getFileSize`)
 * are accepted as plain options exactly like `MediaCoverService`'s own
 * `coverRootFolder`/`MediaCoverServiceDiskProviderLike` constructor
 * parameters -- see that file's doc comment for why (`IAppFolderInfo` isn't
 * ported anywhere in this repo yet). A real caller wiring this controller up
 * should pass the SAME `coverRootFolder` string it already passes to
 * `MediaCoverService`, since both read/write the identical on-disk layout
 * (`{coverRootFolder}/{authorId}/{file}` and `{coverRootFolder}/Books/
 * {bookId}/{file}` -- matching `MediaCoverService.getAuthorCoverPath`/
 * `getBookCoverPath` exactly).
 */

/** Ported from the slice of `IDiskProvider` this controller calls. Same shape as `MediaCoverServiceDiskProviderLike`'s `fileExists`/`getFileSize` members (media-cover/mediaCoverService.ts). */
export interface MediaCoverControllerDiskProviderLike {
  fileExists(path: string): boolean;
  getFileSize(path: string): number;
}

export interface MediaCoverControllerOptions {
  /** Ported from `appFolderInfo.GetAppDataPath()` + "MediaCover" -- see module doc comment. Pass the same root `MediaCoverService` was constructed with. */
  coverRootFolder: string;
  diskProvider: MediaCoverControllerDiskProviderLike;
}

/** Ported from `MediaCoverController.RegexResizedImage`: strips a trailing "-{number}" immediately before the extension, e.g. "poster-500.jpg" -> "poster.jpg". */
const RESIZED_IMAGE_SUFFIX = /-\d+(?=\.(jpg|png|gif)$)/i;

/** Ported from the route templates' own `{filename:regex((.+)\.(jpg|png|gif))}` constraint. */
const VALID_FILENAME = /^.+\.(jpg|png|gif)$/i;

/** Narrow explicit content-type map -- see module doc comment on why this isn't the `mime-types` package. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

/** Ported from `MediaCoverController.GetContentType(string filePath)`. */
function getContentType(filePath: string): string {
  const match = /\.[^.]+$/.exec(filePath);
  const extension = match ? match[0].toLowerCase() : "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/**
 * Shared logic for both routes below -- ported from the two near-identical
 * `GetAuthorMediaCover`/`GetBookMediaCover` action bodies, which differ only
 * in how `filePath` is built (`{coverRoot}/{authorId}/{filename}` vs
 * `{coverRoot}/Books/{bookId}/{filename}`).
 */
function serveMediaCover(
  res: Response,
  filePath: string,
  diskProvider: MediaCoverControllerDiskProviderLike
): void {
  let resolvedPath = filePath;

  if (!diskProvider.fileExists(resolvedPath) || diskProvider.getFileSize(resolvedPath) === 0) {
    // Return the full sized image if someone requests a non-existing resized
    // one. TODO (ported verbatim from the C# source's own TODO): This code
    // can be removed later once everyone had the update for a while.
    const baseFilePath = resolvedPath.replace(RESIZED_IMAGE_SUFFIX, "");

    if (baseFilePath === resolvedPath || !diskProvider.fileExists(baseFilePath)) {
      res.status(404).end();
      return;
    }

    resolvedPath = baseFilePath;
  }

  res.sendFile(resolvedPath, { headers: { "Content-Type": getContentType(resolvedPath) } });
}

export function mediaCoverController(options: MediaCoverControllerOptions): Router {
  const { coverRootFolder, diskProvider } = options;

  const router = Router();

  /** Ported from `[HttpGet(@"author/{authorId:int}/{filename:regex((.+)\.(jpg|png|gif))}")] GetAuthorMediaCover`. */
  router.get(
    "/author/:authorId/:filename",
    asyncHandler((req, res) => {
      const authorId = Number.parseInt(req.params["authorId"] ?? "", 10);
      const filename = req.params["filename"] ?? "";

      if (!Number.isInteger(authorId) || !VALID_FILENAME.test(filename)) {
        // Ported spirit of ASP.NET's route-constraint 404: a request whose
        // {authorId:int}/{filename:regex(...)} template doesn't match never
        // reaches the action at all in the real C# source.
        res.status(404).end();
        return;
      }

      const filePath = join(coverRootFolder, String(authorId), filename);
      serveMediaCover(res, filePath, diskProvider);
    })
  );

  /** Ported from `[HttpGet(@"book/{bookId:int}/{filename:regex((.+)\.(jpg|png|gif))}")] GetBookMediaCover`. */
  router.get(
    "/book/:bookId/:filename",
    asyncHandler((req, res) => {
      const bookId = Number.parseInt(req.params["bookId"] ?? "", 10);
      const filename = req.params["filename"] ?? "";

      if (!Number.isInteger(bookId) || !VALID_FILENAME.test(filename)) {
        res.status(404).end();
        return;
      }

      const filePath = join(coverRootFolder, "Books", String(bookId), filename);
      serveMediaCover(res, filePath, diskProvider);
    })
  );

  return router;
}
