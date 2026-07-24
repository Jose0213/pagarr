import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { Author } from "../../../books/index.js";
import type { IMediaFileService } from "../../../media-files-import/mediaFileService.js";
import type { BookFile } from "../../../media-files-import/bookFile.js";
import type { MetadataTagService } from "../../../media-files-tags/metadataTagService.js";
import type { IUpgradableSpecification } from "../../../decision-engine/specifications/upgradableSpecification.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import { NzbDroneClientException } from "../../../exceptions/NzbDroneClientException.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import {
  bookFileToResource,
  bookFileToResourceWithAuthor,
  type BookFileResource,
} from "./BookFileResource.js";
import type { BookFileListResource } from "./BookFileListResource.js";

/**
 * Ported from Readarr.Api.V1/BookFiles/BookFileController.cs.
 *
 * ## Deliberately NOT `restController()`/`restControllerWithSignalR()`
 *
 * The real C# controller extends `RestControllerWithSignalR<BookFileResource,
 * BookFile>` but overrides essentially every route with custom query-param
 * handling (`GetBookFiles` replaces plain `GetAll` with required
 * `authorId`/`bookFileIds`/`bookId`/`unmapped` filters and a
 * `BadRequestException` if none are supplied) or adds routes the base
 * factory has no slot for (`PUT editor`, `DELETE bulk`) -- there's no
 * `getAll` handler in the base-factory sense at all, since GET / here always
 * requires at least one query filter. This is written as a hand-built
 * `Router` instead, calling this repo's exported `BadRequestException`
 * directly for the pieces that DO match `restController()`'s own behavior
 * (id validation on PUT-by-id/DELETE-by-id), matching the documented escape
 * hatch in `RestController.ts`'s own doc comment ("exported standalone...
 * for future custom-route controllers").
 *
 * NOTE on route ordering: `DELETE /bulk` and `PUT /editor` are literal-path
 * routes that must be registered BEFORE the `/:id` param routes below them
 * -- Express matches routes in registration order, and `/:id` would
 * otherwise swallow `/bulk`/`/editor` as `id="bulk"`/`id="editor"` (the real
 * ASP.NET route table has no such ordering hazard; attribute routing resolves
 * the more specific literal template over `{id:int}` regardless of
 * declaration order since "bulk"/"editor" don't even match the `:int`
 * constraint). Preserved by construction here via explicit registration
 * order, not by a runtime check.
 *
 * SignalR broadcasting (`IHandle<BookFileAddedEvent>`/
 * `IHandle<BookFileDeletedEvent>` -> `BroadcastResourceChange`) is exposed as
 * optional `onBookFileAdded`/`onBookFileDeleted` callbacks a caller wires
 * into the real `messaging/events/eventAggregator.ts` +
 * `signalr/SignalRBroadcaster.ts` (mirroring `restControllerWithSignalR()`'s
 * own event-driven wiring). `onBookFileAdded` specifically has no call site
 * inside this controller itself (matching the real C# source: `Handle
 * (BookFileAddedEvent)` fires off the event bus whenever ANY code path adds
 * a book file -- disk-scan import, manual import, etc -- not from a route
 * this controller owns; `BookFileController` has no create/POST route at
 * all) -- it's accepted here purely so a caller wiring this controller's
 * options can supply the SAME callback it also passes to whatever service
 * publishes `BookFileAddedEvent`, keeping both broadcast paths configured in
 * one place. `mapToResource` is returned alongside the router so that
 * external wiring can build the exact same broadcast payload shape the
 * real `MapToResource` would for a given `BookFile`.
 *
 * `IAuthorService`/`IBookService` are not ported anywhere in this repo yet
 * (verified: no `IAuthorService`/`IBookService` interface exists outside
 * this module). Narrowed to the two methods this controller actually calls,
 * same "forward-reference via narrow local interface" discipline
 * `ManualImportService` (media-files-import/bookImport/manual/
 * manualImportService.ts) already established for the identical situation.
 *
 * `IDeleteMediaFiles` (NzbDrone.Core/MediaFiles/MediaFileDeletionService.cs)
 * is ALSO not ported yet (verified: no `IDeleteMediaFiles`/
 * `MediaFileDeletionService` reference anywhere in this repo outside this
 * file) -- narrowed to its two-overload `deleteTrackFile` surface as a
 * single method taking a nullable `author`, matching how this controller's
 * own call sites branch on `bookFile.editionId > 0 && bookFile.author`
 * either way.
 */

export interface BookFileAuthorLookup {
  getAuthor(authorId: number): Author;
}

export interface BookFileBookLookup {
  getBook(bookId: number): { id: number; authorId: number };
}

export interface BookFileQualityProfileLookup {
  get(id: number): QualityProfile;
}

/** Narrowed forward-ref for `IDeleteMediaFiles` -- see module doc comment. */
export interface IDeleteMediaFiles {
  deleteTrackFile(bookFile: BookFile, author: Author | null, subfolder?: string): void;
}

export interface BookFileControllerOptions {
  mediaFileService: IMediaFileService;
  mediaFileDeletionService: IDeleteMediaFiles;
  metadataTagService: Pick<MetadataTagService, "readTags">;
  authorService: BookFileAuthorLookup;
  bookService: BookFileBookLookup;
  qualityProfileService: BookFileQualityProfileLookup;
  upgradableSpecification: Pick<IUpgradableSpecification, "qualityCutoffNotMet">;
  /** Ported from `Handle(BookFileAddedEvent message)`. See module doc comment -- not called from any route this controller owns. */
  onBookFileAdded?: (resource: BookFileResource) => void;
  /** Ported from `Handle(BookFileDeletedEvent message)`'s `BroadcastResourceChange(ModelAction.Deleted, ...)`. */
  onBookFileDeleted?: (resource: BookFileResource) => void;
}

export interface BookFileControllerResult {
  router: Router;
  /** Ported from `BookFileController.MapToResource` -- exposed so external event wiring (see module doc comment) can build the same resource shape this controller's own routes do. */
  mapToResource: (bookFile: BookFile) => BookFileResource;
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/** Narrows an Express `req.query[...]` value (`string | ParsedQs | (string | ParsedQs)[] | undefined`) down to a plain string, ignoring anything that isn't one -- avoids `String(x)` stringifying a nested `ParsedQs` object as `"[object Object]"`. */
function asQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseIntList(value: unknown): number[] {
  if (value === undefined) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((v) => asQueryString(v))
    .filter((v): v is string => v !== undefined)
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));
}

function validatePositiveId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException(`${id} is not a valid ID`);
  }
}

export function bookFileController(options: BookFileControllerOptions): BookFileControllerResult {
  const {
    mediaFileService,
    mediaFileDeletionService,
    metadataTagService,
    authorService,
    bookService,
    qualityProfileService,
    upgradableSpecification,
    onBookFileDeleted,
  } = options;

  const router = Router();

  /** Ported from `BookFileController.MapToResource`. */
  function mapToResource(bookFile: BookFile): BookFileResource {
    if (bookFile.editionId > 0 && bookFile.author) {
      const profile = qualityProfileService.get(bookFile.author.qualityProfileId);
      return bookFileToResourceWithAuthor(
        bookFile,
        bookFile.author,
        profile,
        upgradableSpecification
      )!;
    }

    return bookFileToResource(bookFile)!;
  }

  function deleteOne(bookFile: BookFile): void {
    if (bookFile.editionId > 0 && bookFile.author) {
      mediaFileDeletionService.deleteTrackFile(bookFile, bookFile.author);
    } else {
      mediaFileDeletionService.deleteTrackFile(bookFile, null, "Unmapped_Files");
    }

    onBookFileDeleted?.(mapToResource(bookFile));
  }

  /** Ported from `BookFileController.GetBookFiles`. Mounted at GET / (no query filter also matches the real controller's own `[HttpGet]` with no route template). */
  router.get(
    "/",
    asyncHandler((req, res) => {
      const authorIdRaw = asQueryString(req.query["authorId"]);
      const authorId = authorIdRaw !== undefined ? Number.parseInt(authorIdRaw, 10) : undefined;
      const bookFileIds = parseIntList(req.query["bookFileIds"]);
      const bookIds = parseIntList(req.query["bookId"]);
      const unmappedRaw = asQueryString(req.query["unmapped"]);
      const unmapped = unmappedRaw !== undefined ? unmappedRaw === "true" : undefined;

      if (
        authorId === undefined &&
        bookFileIds.length === 0 &&
        bookIds.length === 0 &&
        unmapped === undefined
      ) {
        throw new BadRequestException("authorId, bookId, bookFileIds or unmapped must be provided");
      }

      if (unmapped === true) {
        const files = mediaFileService.getUnmappedFiles();
        res.json(files.map((f) => mapToResource(f)));
        return;
      }

      if (authorId !== undefined && bookIds.length === 0) {
        const author = authorService.getAuthor(authorId);
        const profile = qualityProfileService.get(author.qualityProfileId);
        const files = mediaFileService.getFilesByAuthor(authorId);
        res.json(
          files.map((f) =>
            bookFileToResourceWithAuthor(f, author, profile, upgradableSpecification)!
          )
        );
        return;
      }

      if (bookIds.length > 0) {
        const result: BookFileResource[] = [];
        for (const bookId of bookIds) {
          const book = bookService.getBook(bookId);
          const bookAuthor = authorService.getAuthor(book.authorId);
          const profile = qualityProfileService.get(bookAuthor.qualityProfileId);
          const files = mediaFileService.getFilesByBook(book.id);
          result.push(
            ...files.map((f) =>
              bookFileToResourceWithAuthor(f, bookAuthor, profile, upgradableSpecification)!
            )
          );
        }
        res.json(result);
        return;
      }

      // trackfiles will come back with the author already populated
      const bookFiles = mediaFileService.getMany(bookFileIds);
      res.json(bookFiles.map((f) => mapToResource(f)));
    })
  );

  /** Ported from `BookFileController.SetQuality([FromBody] BookFileListResource)` -- `PUT editor`. Registered before `/:id` -- see module doc comment on route ordering. */
  router.put(
    "/editor",
    asyncHandler((req, res) => {
      const resource = req.body as BookFileListResource;
      const bookFiles = mediaFileService.getMany(resource.bookFileIds);

      for (const bookFile of bookFiles) {
        if (resource.quality != null) {
          bookFile.quality = resource.quality;
        }
      }

      mediaFileService.updateMany(bookFiles);

      const firstAuthor = bookFiles[0]?.author;
      if (!firstAuthor) {
        res.status(202).json([]);
        return;
      }
      const profile = qualityProfileService.get(firstAuthor.qualityProfileId);
      res
        .status(202)
        .json(
          bookFiles.map((f) =>
            bookFileToResourceWithAuthor(f, firstAuthor, profile, upgradableSpecification)!
          )
        );
    })
  );

  /** Ported from `BookFileController.DeleteTrackFiles([FromBody] BookFileListResource)` -- `DELETE bulk`. Registered before `/:id` -- see module doc comment on route ordering. */
  router.delete(
    "/bulk",
    asyncHandler((req, res) => {
      const resource = req.body as BookFileListResource;
      const bookFiles = mediaFileService.getMany(resource.bookFileIds);

      for (const bookFile of bookFiles) {
        deleteOne(bookFile);
      }

      res.json({});
    })
  );

  /** Ported from `RestController.GetResourceByIdWithErrorHandler` + `BookFileController.GetResourceById`. */
  router.get(
    "/:id",
    asyncHandler((req, res) => {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      const bookFile = mediaFileService.get(id);
      const resource = mapToResource(bookFile);
      resource.audioTags = metadataTagService.readTags(resource.path) ?? undefined;
      res.json(resource);
    })
  );

  /** Ported from `BookFileController.SetQuality(BookFileResource)` -- `[RestPutById]`. */
  router.put(
    "/:id",
    asyncHandler((req, res) => {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      validatePositiveId(id);

      const bookFileResource = req.body as BookFileResource;
      const bookFile = mediaFileService.get(bookFileResource.id);
      bookFile.quality = bookFileResource.quality;
      mediaFileService.update(bookFile);
      res.status(202).json(mapToResource(bookFile));
    })
  );

  /** Ported from `BookFileController.DeleteBookFile(int id)` -- `[RestDeleteById]`. */
  router.delete(
    "/:id",
    asyncHandler((req, res) => {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      validatePositiveId(id);

      const bookFile = mediaFileService.get(id);

      if (!bookFile) {
        throw new NzbDroneClientException(404, "Book file not found");
      }

      deleteOne(bookFile);
      res.json({});
    })
  );

  return { router, mapToResource };
}
