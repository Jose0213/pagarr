import type { Router } from "express";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { combineValidators } from "../../rest/ResourceValidator.js";
import type { IRootFolderService } from "../../../root-folders/root-folder-service.js";
import type { RootFolder } from "../../../root-folders/root-folder.js";
import {
  ROOT_FOLDER_RESOURCE_NAME,
  rootFolderToModel,
  rootFolderToResource,
  rootFoldersToResource,
} from "./RootFolderResource.js";
import type { RootFolderResource } from "./RootFolderResource.js";

/**
 * Ported from Readarr.Api.V1/RootFolders/RootFolderController.cs.
 *
 * ## Validators NOT ported (forward-ref -- dependencies don't exist yet)
 *
 * The real ctor wires nine FluentValidation validators onto
 * `SharedValidator`/`PostValidator`: `RecycleBinValidator`,
 * `RootFolderValidator`, `PathExistsValidator`,
 * `MappedNetworkDriveValidator`, `StartupFolderValidator`,
 * `SystemFolderValidator`, `FolderWritableValidator`,
 * `QualityProfileExistsValidator`, `MetadataProfileExistsValidator` --
 * every one of them a class from `NzbDrone.Core.Validation.Paths` /
 * `NzbDrone.Core.Validation`, none of which are ported anywhere in this
 * repo yet (Validation is a Phase-4-Wave-2-adjacent module; only
 * `validation/entityExistsValidators.ts`/`ruleHelpers.ts`/
 * `folderChmodValidator.ts` exist so far -- see that directory's own files;
 * none of them are the *specific* nine classes this controller needs). This
 * port keeps the two checks that ARE self-contained and already real in
 * this port's `RootFolderService`:
 *
 *   - Path existence/writability (`verifyRootFolder` inside
 *     `RootFolderService.add`/`.update`, see root-folder-service.ts) --
 *     throws `InvalidPathError`/`DirectoryNotFoundError`/
 *     `UnauthorizedAccessError` (root-folders/errors.ts), none of which
 *     this port's `readarrErrorPipeline` maps specially, so they fall
 *     through to the generic 500 branch. This is a KNOWN GAP relative to
 *     the real C# behavior (which surfaces these as 400 `ValidationResult`
 *     failures via `PathExistsValidator`/`FolderWritableValidator`) --
 *     tracked here rather than silently accepted; a future Validation-module
 *     port should wire these service-thrown errors into
 *     `SharedValidator`-shaped failures (or have `readarrErrorPipeline` map
 *     them to 400) to close it.
 *   - `RootFolderAlreadyExistsError` (path already registered as a root
 *     folder) -- same gap: the real C#'s equivalent duplicate-path check is
 *     `RootFolderValidator` (`PostValidator`-only, ported nowhere yet); this
 *     port's `RootFolderService.add` throws a plain `RootFolderAlreadyExistsError`
 *     instead, which also falls through to the generic 500 branch today.
 *
 * `QualityProfileExistsValidator`/`MetadataProfileExistsValidator`,
 * `MappedNetworkDriveValidator`/`StartupFolderValidator`/
 * `SystemFolderValidator`/`RecycleBinValidator`, and the whole
 * Calibre-specific `SharedValidator` block (Host/Port/UrlBase/Username/
 * Password/OutputFormat/OutputProfile, `CalibreLibraryOnlyUsedOnce`) are
 * NOT ported at all: Quality/Metadata Profiles and Books.Calibre
 * (`ICalibreProxy`) are out of this task's scope and don't exist in this
 * repo. `Name` NotEmpty is the one SharedValidator rule ported here
 * standalone since it has zero cross-module dependencies.
 *
 * `_calibreProxy.Test(model.CalibreSettings)` (a live network probe against
 * a configured Calibre Content Server before accepting a Calibre-backed
 * root folder) is likewise not ported -- no `ICalibreProxy` exists in this
 * repo. `create`/`update` below skip that probe entirely for a
 * `isCalibreLibrary: true` payload; the row is still persisted faithfully
 * otherwise.
 *
 * ## What IS ported faithfully
 *
 *   - The five REST routes + SignalR broadcasting (RestControllerWithSignalR).
 *   - `GetRootFolders()` -> `AllWithSpaceStats()` (GET / uses the space-stats
 *     variant, not the plain `all()` -- ported exactly, matching the real
 *     controller calling `_rootFolderService.AllWithSpaceStats()` for its
 *     `[HttpGet]` action while `GetResourceById` uses the plain,
 *     probe-and-return `Get(id)`).
 *   - `UpdateRootFolder`'s "cannot edit root folder path" check
 *     (`BadRequestException` if `model.Path != rootFolderResource.Path`) --
 *     ported literally below.
 *   - `SharedValidator.RuleFor(c => c.Name).NotEmpty()`.
 */
export interface RootFolderControllerOptions {
  rootFolderService: IRootFolderService;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
}

export function rootFolderController(options: RootFolderControllerOptions): Router {
  const { rootFolderService, eventAggregator, signalRBroadcaster } = options;

  // Ported: `SharedValidator.RuleFor(c => c.Name).NotEmpty();` -- see module
  // doc comment for every OTHER SharedValidator/PostValidator rule NOT
  // ported here.
  const nameNotEmpty: ResourceValidator<RootFolderResource> = (resource) =>
    resource.name && resource.name.trim() !== ""
      ? []
      : [{ propertyName: "name", errorMessage: "'Name' must not be empty." }];

  const { router } = restControllerWithSignalR<RootFolderResource, RootFolder>({
    resourceName: ROOT_FOLDER_RESOURCE_NAME,
    eventAggregator,
    signalRBroadcaster,
    sharedValidator: combineValidators(nameNotEmpty),

    // Ported from `GetResourceById(int id)`: the plain (non-space-stats)
    // lookup -- used for GET /:id and Created/Accepted re-fetches.
    getById: async (id) => rootFolderToResource(await rootFolderService.get(id)),

    getResourceByIdForBroadcast: async (id) =>
      rootFolderToResource(await rootFolderService.get(id)),

    // Ported from `GetRootFolders()`: GET / uses AllWithSpaceStats(), NOT
    // GetResourceById's plain Get -- see module doc comment.
    getAll: async () => rootFoldersToResource(await rootFolderService.allWithSpaceStats()),

    create: async (resource) => {
      const model = rootFolderToModel(resource);
      const created = await rootFolderService.add(model);
      return rootFolderToResource(created);
    },

    update: async (resource) => {
      const model = rootFolderToModel(resource);

      // Ported LITERALLY from UpdateRootFolder: `var model =
      // rootFolderResource.ToModel(); if (model.Path != rootFolderResource.Path)
      // throw new BadRequestException("Cannot edit root folder path");`.
      // `ToModel()` copies `Path` straight across with no transformation
      // (see RootFolderResourceMapper.ToModel -- only the reverse direction,
      // ToResource, applies `GetCleanPath()`), so `model.Path` and
      // `rootFolderResource.Path` are, at this point in the real method,
      // always the exact same string -- this check can NEVER actually
      // throw. This is a genuine dead-code bug in the real Readarr source
      // (its evident intent, "you can't change a root folder's path via
      // PUT," is never enforced), preserved here as-written rather than
      // "fixed" to compare against the previously-stored path, per this
      // task's "preserve a C# bug, documented, don't fix it" rule.
      if (model.path !== resource.path) {
        throw new BadRequestException("Cannot edit root folder path");
      }

      const updated = await rootFolderService.update(model);
      return rootFolderToResource(updated);
    },

    delete: (id) => {
      rootFolderService.remove(id);
    },
  });

  return router;
}
