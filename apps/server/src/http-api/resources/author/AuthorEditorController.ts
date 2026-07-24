import { Router } from "express";
import type { Author, AuthorService } from "../../../books/index.js";
import type { IManageCommandQueue } from "../../../messaging/commands/commandQueueManager.js";
import { CommandPriority } from "../../../messaging/commands/commandPriority.js";
import { CommandTrigger } from "../../../messaging/commands/commandTrigger.js";
import { ApplyTags } from "../../rest/ApplyTags.js";
import type { AuthorEditorResource } from "./AuthorEditorResource.js";
import { BulkMoveAuthorCommand, type BulkMoveAuthor } from "./authorCommands.js";

/**
 * Ported from Readarr.Api.V1/Author/AuthorEditorController.cs.
 *
 * `[V1ApiController("author/editor")]` -> mount path `/api/v1/author/editor`
 * (an explicit resource-name override, distinct from `AuthorController`'s
 * default-derived `/api/v1/author` -- see that file's module doc comment on
 * the `[V1ApiController]` route convention). This is a plain `Controller`
 * in the real C# source, NOT a `RestController<TResource>` subclass -- it
 * has no GET/POST/individual-id routes at all, just the two bulk verbs
 * below -- so this port returns a bare Express `Router` built directly
 * (mirroring `ProviderControllerBase.ts`'s "build on `Router()` directly for
 * the provider-specific routes" pattern), not built on `restController()`.
 *
 * `IManageCommandQueue` (`BulkMoveAuthorCommand`) -- see `authorCommands.ts`'s
 * module doc comment for why that command class is defined locally in this
 * same directory rather than imported from a `books/commands` module that
 * doesn't exist yet.
 */

export interface AuthorEditorControllerOptions {
  authorService: AuthorService;
  commandQueueManager: IManageCommandQueue;
  /**
   * Ported from `IBuildAuthorPaths.BuildPath(author, useExistingRelativeFolder)`
   * -- the same required-callback seam `books/authorService.ts`'s
   * `updateAuthors()` already exposes (see that file's own doc comment: the
   * Organizer module's real path-builder isn't part of the already-merged
   * `books/` module). Optional here; defaults to `defaultBuildPath` below
   * (a minimal, non-Organizer-faithful `rootFolderPath + "/" + cleanName`
   * join) when omitted -- see that function's doc comment for why this
   * controller doesn't hard-require the real `FileNameBuilder`.
   */
  buildPath?: (author: Author, useExistingRelativeFolder: boolean) => string;
}

/**
 * Ported from `AuthorEditorController.SaveAll([FromBody] AuthorEditorResource
 * resource)`: `[HttpPut]` at the controller's own route root (`PUT
 * /api/v1/author/editor`).
 *
 *   1. Fetch every author named in `resource.AuthorIds`.
 *   2. For each: apply any of monitored/monitorNewItems/qualityProfileId/
 *      metadataProfileId that were actually supplied (C#'s `.HasValue`
 *      nullable-struct check -- ported as `!= null` on this port's optional
 *      fields, matching the same "field present in the JSON body at all"
 *      semantics `AuthorEditorResource`'s optional properties carry).
 *   3. If `rootFolderPath` is non-blank: stamp it onto the author AND queue
 *      a `BulkMoveAuthor` entry (source = the author's CURRENT path, before
 *      any of this request's other field changes take effect -- read before
 *      the loop mutates `author.path` anywhere, matching the real C#'s
 *      `SourcePath = author.Path` read at the same point in its own loop
 *      body, i.e. before `_authorService.UpdateAuthors` is ever called).
 *   4. If `tags` is supplied: apply Add/Remove/Replace per `applyTags`.
 *   5. After the loop: if `moveFiles` AND at least one author was queued for
 *      a move, push ONE `BulkMoveAuthorCommand` covering all of them.
 *   6. Respond 202 Accepted with `_authorService.UpdateAuthors(authorsToUpdate,
 *      !resource.MoveFiles).ToResource()` -- note the SECOND argument is
 *      `useExistingRelativeFolder = !moveFiles`: when files are being
 *      physically moved (moveFiles=true), the service does NOT try to keep
 *      each author's existing relative subfolder name while rebuilding
 *      `Path` from the new `RootFolderPath` (the move itself handles
 *      relocating to a folder computed fresh); when moveFiles=false (editing
 *      RootFolderPath as a metadata-only change, no physical move queued),
 *      the existing relative folder IS preserved. This inversion is
 *      preserved exactly, not "fixed" -- see this port's Standing Rules.
 */
function saveAll(
  authorService: AuthorService,
  commandQueueManager: IManageCommandQueue,
  buildPath: (author: Author, useExistingRelativeFolder: boolean) => string
) {
  return (resource: AuthorEditorResource): Author[] => {
    const authorsToUpdate = authorService.getAuthors(resource.authorIds);
    const authorsToMove: BulkMoveAuthor[] = [];

    const updated = authorsToUpdate.map((author) => {
      let next = author;

      if (resource.monitored !== null && resource.monitored !== undefined) {
        next = { ...next, monitored: resource.monitored };
      }

      if (resource.monitorNewItems !== null && resource.monitorNewItems !== undefined) {
        next = { ...next, monitorNewItems: resource.monitorNewItems };
      }

      if (resource.qualityProfileId !== null && resource.qualityProfileId !== undefined) {
        next = { ...next, qualityProfileId: resource.qualityProfileId };
      }

      if (resource.metadataProfileId !== null && resource.metadataProfileId !== undefined) {
        next = { ...next, metadataProfileId: resource.metadataProfileId };
      }

      if (resource.rootFolderPath && resource.rootFolderPath.trim() !== "") {
        authorsToMove.push({ authorId: author.id, sourcePath: author.path });
        next = { ...next, rootFolderPath: resource.rootFolderPath };
      }

      if (resource.tags) {
        const newTags = resource.tags;
        switch (resource.applyTags) {
          case ApplyTags.Add: {
            const tagSet = new Set(next.tags);
            for (const t of newTags) {
              tagSet.add(t);
            }
            next = { ...next, tags: [...tagSet] };
            break;
          }
          case ApplyTags.Remove: {
            const removeSet = new Set(newTags);
            next = { ...next, tags: next.tags.filter((t) => !removeSet.has(t)) };
            break;
          }
          case ApplyTags.Replace: {
            next = { ...next, tags: [...new Set(newTags)] };
            break;
          }
          default:
            break;
        }
      }

      return next;
    });

    if (resource.moveFiles && authorsToMove.length > 0) {
      const command = new BulkMoveAuthorCommand();
      command.destinationRootFolder = resource.rootFolderPath ?? "";
      command.author = authorsToMove;

      commandQueueManager.push(command, CommandPriority.Normal, CommandTrigger.Manual);
    }

    return authorService.updateAuthors(updated, !resource.moveFiles, buildPath);
  };
}

/**
 * Ported from `IBuildAuthorPaths.BuildPath(author, useExistingRelativeFolder)`
 * -- the Organizer-module path-computation `AuthorService.UpdateAuthors`
 * needs (see `books/authorService.ts`'s own doc comment: this is the exact
 * "inject the missing piece narrowly" seam that ported method already
 * exposes as a required callback parameter, since `IBuildAuthorPaths` itself
 * isn't part of the already-merged `books/` module). This controller has no
 * `FileNameBuilder`/`AuthorPathBuilder` dependency wired in either (it's
 * optional on `AuthorController` for the narrower
 * `AuthorFolderAsRootFolderValidator` rule, but `AuthorEditorController`'s
 * real C# source has no equivalent optional path here -- `UpdateAuthors`
 * unconditionally needs SOME path-builder). Rather than silently return the
 * author unchanged (which would violate `UpdateAuthors`'s own contract that
 * every author with a non-blank `RootFolderPath` gets a recomputed `Path`),
 * this default implementation uses a minimal, honest
 * `rootFolderPath + "/" + cleanName` join -- NOT a faithful port of the real
 * Organizer naming-template engine (`FileNameBuilder.GetAuthorFolder` +
 * naming-config-driven pattern), but the narrowest placeholder that keeps
 * this controller's real behavior (persisting a rebuilt path for every moved
 * author) observable rather than a silent no-op. A caller wiring up the real
 * `FileNameBuilder` should construct `authorEditorController` with its own
 * `buildPath` option instead (see `AuthorEditorControllerOptions.buildPath`).
 */
function defaultBuildPath(author: Author, _useExistingRelativeFolder: boolean): string {
  const base = author.rootFolderPath.replace(/[/\\]+$/, "");
  return `${base}/${author.cleanName}`;
}

export function authorEditorController(options: AuthorEditorControllerOptions): Router {
  const { authorService, commandQueueManager, buildPath = defaultBuildPath } = options;
  const router = Router();

  const saveAllHandler = saveAll(authorService, commandQueueManager, buildPath);

  router.put("/", (req, res, next) => {
    try {
      const resource = req.body as AuthorEditorResource;
      const updated = saveAllHandler(resource);
      res.status(202).json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Ported from `AuthorEditorController.DeleteAuthor([FromBody]
   * AuthorEditorResource resource)`: `[HttpDelete]`. Deletes every author in
   * `resource.AuthorIds`, ALWAYS with `deleteFiles: false` (the real C#
   * source hardcodes `false` as `DeleteAuthor`'s second argument -- it never
   * reads `AuthorEditorResource.DeleteFiles` at all despite that field
   * existing on the resource, and this bulk-delete endpoint takes an
   * `AuthorEditorResource` body, NOT the sibling
   * `AuthorEditorDeleteResource` type that would have made that field
   * meaningful -- see `AuthorEditorDeleteResource.ts`'s own doc comment for
   * the same dead-code note). Responds `{}` (200), matching `return new {
   * };`.
   */
  router.delete("/", (req, res, next) => {
    try {
      const resource = req.body as AuthorEditorResource;
      for (const authorId of resource.authorIds) {
        authorService.deleteAuthor(authorId, false);
      }
      res.json({});
    } catch (err) {
      next(err);
    }
  });

  return router;
}
